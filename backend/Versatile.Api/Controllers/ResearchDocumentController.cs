using System.Net;
using System.Text.RegularExpressions;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Application.ResearchDocuments.Queries;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research-document"), Authorize]
[RequestSizeLimit(100_000_000)]
public class ResearchDocumentController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public ResearchDocumentController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext)
    {
        _mediator = mediator;
    }

    [HttpGet]
    public async Task<ActionResult<List<ResearchDocumentDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetResearchDocumentsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<ResearchDocumentDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetResearchDocumentByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<ResearchDocumentDto>> Create(Guid storyId, CreateResearchDocumentRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateResearchDocumentCommand(storyId, request.FileName, request.FileType, request.Content, request.Notes, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ResearchDocumentDto>> Update(Guid id, UpdateResearchDocumentRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateResearchDocumentCommand(id, request.FileName, request.FileType, request.Content, request.Notes, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteResearchDocumentCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost("fetch-url")]
    public async Task<ActionResult<FetchUrlResponse>> FetchUrl(Guid storyId, FetchUrlRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Url))
            return BadRequest(new { message = "URL is required." });

        if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri))
            return BadRequest(new { message = "Invalid URL. Must start with http:// or https://." });

        // SSRF guard: scheme, credentials, blocked names/IPs, then DNS.
        // Each redirect target is re-validated the same way below.
        if (!UrlFetchGuard.TryValidateUri(uri, out var reason))
            return BadRequest(new { message = reason });

        var (resolvesPublic, dnsReason) = await UrlFetchGuard.ValidateResolvesToPublicAsync(uri.Host, HttpContext.RequestAborted);
        if (!resolvesPublic)
            return BadRequest(new { message = dnsReason });

        try
        {
            // No auto-redirect: HttpClient would otherwise follow a Location
            // header to an internal address without re-validation.
            using var handler = new SocketsHttpHandler { AllowAutoRedirect = false };
            using var client = new HttpClient(handler);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(
                timeout.Token, HttpContext.RequestAborted);

            var current = uri;
            HttpResponseMessage? response = null;
            {
                for (var redirect = 0; ; redirect++)
                {
                    response?.Dispose();
                    using var message = new HttpRequestMessage(HttpMethod.Get, current);
                    response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, linked.Token);

                    if (!IsRedirect(response.StatusCode) || redirect >= UrlFetchGuard.MaxRedirects)
                        break;

                    var location = response.Headers.Location;
                    if (location is null)
                        break;

                    var next = new Uri(current, location);
                    if (!UrlFetchGuard.TryValidateUri(next, out var redirectReason))
                    {
                        response.Dispose();
                        return BadRequest(new { message = redirectReason });
                    }

                    var (nextPublic, nextDnsReason) = await UrlFetchGuard.ValidateResolvesToPublicAsync(next.Host, linked.Token);
                    if (!nextPublic)
                    {
                        response.Dispose();
                        return BadRequest(new { message = nextDnsReason });
                    }

                    current = next;
                }

                using (response)
                {
                    var html = await ReadCappedAsync(response.Content, 5_000_000, linked.Token);
                    var title = ExtractTitle(html);
                    return Ok(new FetchUrlResponse(title, html, (int)response.StatusCode));
                }
            }
        }
        catch (OperationCanceledException) when (!HttpContext.RequestAborted.IsCancellationRequested)
        {
            return BadRequest(new { message = "Request timed out after 30 seconds." });
        }
        catch (HttpRequestException)
        {
            // Deliberately generic: exception text can carry resolver and
            // socket internals that must not reach the client.
            return BadRequest(new { message = "Could not fetch the URL." });
        }
    }

    private static bool IsRedirect(HttpStatusCode status) =>
        status is HttpStatusCode.MovedPermanently or HttpStatusCode.Found
            or HttpStatusCode.SeeOther or HttpStatusCode.TemporaryRedirect
            or (HttpStatusCode)308;

    private static async Task<string> ReadCappedAsync(HttpContent content, int maxBytes, CancellationToken cancellationToken)
    {
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var buffered = new MemoryStream();
        var chunk = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(chunk, cancellationToken)) > 0)
        {
            var remaining = maxBytes + 1L - buffered.Length;
            if (remaining <= 0)
                break;
            buffered.Write(chunk, 0, (int)Math.Min(read, remaining));
            if (buffered.Length > maxBytes)
                break;
        }

        buffered.Position = 0;
        using var reader = new StreamReader(buffered);
        var text = await reader.ReadToEndAsync(cancellationToken);
        return text.Length > maxBytes ? text[..maxBytes] : text;
    }

    private static string ExtractTitle(string html)
    {
        var match = Regex.Match(html, @"<title[^>]*>([^<]*)</title>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return match.Success ? match.Groups[1].Value.Trim() : "Untitled";
    }
}

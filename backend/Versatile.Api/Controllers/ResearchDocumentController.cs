using System.Text.RegularExpressions;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Application.ResearchDocuments.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research-document"), Authorize]
[RequestSizeLimit(100_000_000)]
public class ResearchDocumentController : ApiControllerBase
{
    private readonly IMediator _mediator;
    private readonly IHttpClientFactory _httpClientFactory;

    public ResearchDocumentController(IMediator mediator, IOrganizationContext orgContext, IHttpClientFactory httpClientFactory) : base(orgContext)
    {
        _mediator = mediator;
        _httpClientFactory = httpClientFactory;
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

        if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "http" && uri.Scheme != "https"))
            return BadRequest(new { message = "Invalid URL. Must start with http:// or https://." });

        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            using var response = await client.GetAsync(uri);
            var html = await response.Content.ReadAsStringAsync();

            var title = ExtractTitle(html);
            if (html.Length > 5_000_000)
                html = html[..5_000_000];

            return Ok(new FetchUrlResponse(title, html, (int)response.StatusCode));
        }
        catch (TaskCanceledException)
        {
            return BadRequest(new { message = "Request timed out after 30 seconds." });
        }
        catch (HttpRequestException ex)
        {
            return BadRequest(new { message = $"Failed to fetch URL: {ex.Message}" });
        }
    }

    private static string ExtractTitle(string html)
    {
        var match = Regex.Match(html, @"<title[^>]*>([^<]*)</title>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return match.Success ? match.Groups[1].Value.Trim() : "Untitled";
    }
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Services;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/[controller]"), Authorize]
public class ApiKeysController : ControllerBase
{
    private readonly IRepository<User> _userRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly KeyManagementService _keys;
    private readonly IChatProviderFactory _providerFactory;

    public ApiKeysController(IRepository<User> userRepo, IUnitOfWork unitOfWork, KeyManagementService keys, IChatProviderFactory providerFactory)
    {
        _userRepo = userRepo;
        _unitOfWork = unitOfWork;
        _keys = keys;
        _providerFactory = providerFactory;
    }

    [HttpPost("test")]
    public async Task<ActionResult> TestConnection([FromBody] TestConnectionRequest request)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        try
        {
            var provider = await _providerFactory.CreateAsync(request.Provider, userId.ToString());
            var result = await provider.TestConnectionAsync(request.Model);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return Ok(new TestConnectionResult(false, null, ex.Message));
        }
    }

    [HttpPost("{provider}/models")]
    public async Task<ActionResult> ListModels(string provider)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        try
        {
            var chatProvider = await _providerFactory.CreateAsync(provider, userId.ToString());
            var result = await chatProvider.ListModelsAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            return Ok(new ListModelsResult(false, [], ex.Message));
        }
    }

    [HttpGet("{provider}")]
    public async Task<ActionResult<object>> GetKey(string provider)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var user = await _userRepo.GetByIdAsync(userId);
        if (user?.ApiKeysEncrypted == null || user.ApiKeysNonce == null)
            return NotFound(new { message = "No API keys stored" });

        var json = _keys.Decrypt(user.ApiKeysEncrypted, user.ApiKeysNonce);
        var keys = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(json);
        return keys?.TryGetValue(provider, out var key) == true
            ? Ok(new { key })
            : NotFound(new { message = $"Key for {provider} not found" });
    }

    [HttpPut("{provider}")]
    public async Task<ActionResult> StoreKey(string provider, [FromBody] StoreKeyRequest request)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var user = await _userRepo.GetByIdAsync(userId);
        if (user == null)
            return Unauthorized();

        Dictionary<string, string> keys;
        if (user.ApiKeysEncrypted != null && user.ApiKeysNonce != null)
        {
            var json = _keys.Decrypt(user.ApiKeysEncrypted, user.ApiKeysNonce);
            keys = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
        }
        else
        {
            keys = [];
        }

        keys[provider] = request.Key;
        var (encrypted, nonce) = _keys.Encrypt(System.Text.Json.JsonSerializer.Serialize(keys));

        user.ApiKeysEncrypted = encrypted;
        user.ApiKeysNonce = nonce;
        await _unitOfWork.SaveChangesAsync();

        return Ok(new { message = $"Key for {provider} stored" });
    }

    [HttpDelete("{provider}")]
    public async Task<ActionResult> DeleteKey(string provider)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var user = await _userRepo.GetByIdAsync(userId);
        if (user?.ApiKeysEncrypted == null || user.ApiKeysNonce == null)
            return NotFound();

        var json = _keys.Decrypt(user.ApiKeysEncrypted, user.ApiKeysNonce);
        var keys = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
        keys.Remove(provider);

        var (encrypted, nonce) = _keys.Encrypt(System.Text.Json.JsonSerializer.Serialize(keys));
        user.ApiKeysEncrypted = encrypted;
        user.ApiKeysNonce = nonce;
        await _unitOfWork.SaveChangesAsync();

        return Ok(new { message = $"Key for {provider} deleted" });
    }
}

public record StoreKeyRequest(string Key);

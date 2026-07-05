using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace Versatile.Infrastructure.Services;

public class KeyManagementService
{
    private readonly byte[] _encryptionKey;
    private const int TagSize = 16;

    public KeyManagementService(IConfiguration configuration)
    {
        var masterKey = configuration["Encryption:MasterKey"]
            ?? throw new InvalidOperationException("Encryption:MasterKey is not configured.");
        _encryptionKey = SHA256.HashData(Encoding.UTF8.GetBytes(masterKey));
    }

    public (string Encrypted, string Nonce) Encrypt(string plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var tag = new byte[TagSize];
        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var ciphertext = new byte[plainBytes.Length];

        using var aes = new AesGcm(_encryptionKey, TagSize);
        aes.Encrypt(nonce, plainBytes, ciphertext, tag);

        return (Convert.ToBase64String(ciphertext) + "." + Convert.ToBase64String(tag),
                Convert.ToBase64String(nonce));
    }

    public string Decrypt(string encrypted, string nonceBase64)
    {
        var parts = encrypted.Split('.');
        var ciphertext = Convert.FromBase64String(parts[0]);
        var tag = Convert.FromBase64String(parts[1]);
        var nonce = Convert.FromBase64String(nonceBase64);
        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(_encryptionKey, TagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        return Encoding.UTF8.GetString(plaintext);
    }
}

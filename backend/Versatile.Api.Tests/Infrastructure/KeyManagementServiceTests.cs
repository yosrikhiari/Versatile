using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Tests.Infrastructure;

public class KeyManagementServiceTests
{
    private static KeyManagementService CreateService()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Encryption:MasterKey"] = "test-master-key-for-unit-tests-32chr!"
            })
            .Build();

        return new KeyManagementService(config);
    }

    [Fact]
    public void Encrypt_Decrypt_RoundTrip_ReturnsOriginalText()
    {
        var service = CreateService();
        var original = "sk-abc123def456";

        var (encrypted, nonce) = service.Encrypt(original);
        var decrypted = service.Decrypt(encrypted, nonce);

        decrypted.Should().Be(original);
    }

    [Fact]
    public void Encrypt_Produces_Different_Ciphertext_Each_Time()
    {
        var service = CreateService();
        var original = "same-value";

        var (encrypted1, _) = service.Encrypt(original);
        var (encrypted2, _) = service.Encrypt(original);

        encrypted1.Should().NotBe(encrypted2);
    }

    [Fact]
    public void Decrypt_Wrong_Nonce_Throws()
    {
        var service = CreateService();
        var (encrypted, _) = service.Encrypt("hello");

        var wrongNonce = Convert.ToBase64String(new byte[12]);

        var act = () => service.Decrypt(encrypted, wrongNonce);
        act.Should().Throw<CryptographicException>();
    }
}

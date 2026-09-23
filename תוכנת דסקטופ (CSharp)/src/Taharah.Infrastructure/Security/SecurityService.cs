using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace Taharah.Infrastructure.Security;

public sealed class SecurityService : ISecurityService
{
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int Iterations = 100_000;
    private const int DbKeySize = 32; // AES-256
    private const int GcmNonceSize = 12;
    private const int GcmTagSize = 16;

    public string HashPin(string pin)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(pin),
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize);

        return $"PBKDF2${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public bool VerifyPin(string pin, string storedHash)
    {
        if (string.IsNullOrEmpty(pin) || string.IsNullOrEmpty(storedHash))
            return false;

        // Legacy plain PIN support (if 6 digits directly stored)
        if (storedHash.Length == 6 && storedHash.All(char.IsDigit))
        {
            return pin == storedHash;
        }

        var parts = storedHash.Split('$');
        if (parts.Length != 4 || parts[0] != "PBKDF2")
            return false;

        if (!int.TryParse(parts[1], out int iterations))
            return false;

        byte[] salt;
        byte[] expectedHash;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expectedHash = Convert.FromBase64String(parts[3]);
        }
        catch
        {
            return false;
        }

        byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(pin),
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expectedHash.Length);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }

    public string EncryptString(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return string.Empty;
        byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            byte[] protectedBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(protectedBytes);
        }
        else
        {
            // Fallback for non-Windows: simple base64 (Windows is the primary platform)
            return Convert.ToBase64String(plainBytes);
        }
    }

    public string DecryptString(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return string.Empty;
        byte[] cipherBytes = Convert.FromBase64String(cipherText);

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            byte[] unprotectedBytes = ProtectedData.Unprotect(cipherBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(unprotectedBytes);
        }
        else
        {
            return Encoding.UTF8.GetString(cipherBytes);
        }
    }

    public string GenerateDbSalt() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(SaltSize));

    public byte[] DeriveDbKey(string pin, string saltBase64)
    {
        byte[] salt = Convert.FromBase64String(saltBase64);
        return Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(pin),
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            DbKeySize);
    }

    public (string Iv, string Data) EncryptDbBlob(byte[] key, string plaintext)
    {
        byte[] nonce = RandomNumberGenerator.GetBytes(GcmNonceSize);
        byte[] plainBytes = Encoding.UTF8.GetBytes(plaintext);
        byte[] cipherBytes = new byte[plainBytes.Length];
        byte[] tag = new byte[GcmTagSize];

        using var gcm = new AesGcm(key, GcmTagSize);
        gcm.Encrypt(nonce, plainBytes, cipherBytes, tag);

        byte[] combined = new byte[cipherBytes.Length + GcmTagSize];
        Buffer.BlockCopy(cipherBytes, 0, combined, 0, cipherBytes.Length);
        Buffer.BlockCopy(tag, 0, combined, cipherBytes.Length, GcmTagSize);

        return (Convert.ToBase64String(nonce), Convert.ToBase64String(combined));
    }

    public string DecryptDbBlob(byte[] key, string ivBase64, string dataBase64)
    {
        byte[] nonce = Convert.FromBase64String(ivBase64);
        byte[] combined = Convert.FromBase64String(dataBase64);

        int cipherLength = combined.Length - GcmTagSize;
        if (cipherLength < 0)
        {
            throw new CryptographicException("Malformed encrypted database blob.");
        }

        byte[] cipherBytes = new byte[cipherLength];
        byte[] tag = new byte[GcmTagSize];
        Buffer.BlockCopy(combined, 0, cipherBytes, 0, cipherLength);
        Buffer.BlockCopy(combined, cipherLength, tag, 0, GcmTagSize);

        byte[] plainBytes = new byte[cipherLength];
        using var gcm = new AesGcm(key, GcmTagSize);
        // Throws CryptographicException on auth-tag mismatch (wrong key or corrupted data) -
        // callers must not treat that as "empty database".
        gcm.Decrypt(nonce, cipherBytes, tag, plainBytes);

        return Encoding.UTF8.GetString(plainBytes);
    }
}

namespace Taharah.Infrastructure.Security;

public interface ISecurityService
{
    string HashPin(string pin);
    bool VerifyPin(string pin, string storedHash);
    string EncryptString(string plainText);
    string DecryptString(string cipherText);

    /// <summary>16 random bytes, base64 - a fresh salt for deriving a database encryption key from a PIN.</summary>
    string GenerateDbSalt();

    /// <summary>PBKDF2-SHA256 (100,000 iterations), 32-byte key - mirrors js/dbCrypto.js deriveDbKey.</summary>
    byte[] DeriveDbKey(string pin, string saltBase64);

    /// <summary>AES-GCM-256 encrypt; returns a fresh IV (base64) alongside the ciphertext (base64).</summary>
    (string Iv, string Data) EncryptDbBlob(byte[] key, string plaintext);

    /// <summary>AES-GCM-256 decrypt. Throws (auth-tag mismatch) on a wrong key or corrupted data - callers must never treat that as "empty database".</summary>
    string DecryptDbBlob(byte[] key, string ivBase64, string dataBase64);
}

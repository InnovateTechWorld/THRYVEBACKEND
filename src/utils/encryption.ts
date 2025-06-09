import crypto from 'crypto';

// ✅ FIXED: Properly handle the encryption key
const getEncryptionKey = (): Buffer => {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (!envKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  
  // ✅ Convert hex string to Buffer (your key is 64 hex chars = 32 bytes)
  if (envKey.length === 64) {
    // Hex format
    return Buffer.from(envKey, 'hex');
  } else if (envKey.length === 44) {
    // Base64 format (ends with =)
    return Buffer.from(envKey, 'base64');
  } else {
    throw new Error(`Invalid ENCRYPTION_KEY format. Expected 64 hex chars or 44 base64 chars, got ${envKey.length}`);
  }
};

const ALGORITHM = 'aes-256-gcm';

export class EncryptionUtils {
  static encrypt(text: string): string {
    try {
      const key = getEncryptionKey(); // ✅ Use function instead of const
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  static decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const key = getEncryptionKey(); // ✅ Use function instead of const
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  // ✅ KEEP: Your existing functions unchanged
  static generateApiKey(): string {
    return 'sk-' + crypto.randomBytes(32).toString('hex');
  }

  static hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  // ✅ ADD: Test function for validation
  static testEncryption(): boolean {
    try {
      const testText = 'test-' + Date.now();
      const encrypted = this.encrypt(testText);
      const decrypted = this.decrypt(encrypted);
      return decrypted === testText;
    } catch (error) {
      return false;
    }
  }
}
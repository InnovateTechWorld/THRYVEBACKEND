"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionUtils = void 0;
const crypto_1 = __importDefault(require("crypto"));
// ✅ FIXED: Properly handle the encryption key
const getEncryptionKey = () => {
    const envKey = process.env.ENCRYPTION_KEY;
    if (!envKey) {
        throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    // ✅ Convert hex string to Buffer (your key is 64 hex chars = 32 bytes)
    if (envKey.length === 64) {
        // Hex format
        return Buffer.from(envKey, 'hex');
    }
    else if (envKey.length === 44) {
        // Base64 format (ends with =)
        return Buffer.from(envKey, 'base64');
    }
    else {
        throw new Error(`Invalid ENCRYPTION_KEY format. Expected 64 hex chars or 44 base64 chars, got ${envKey.length}`);
    }
};
const ALGORITHM = 'aes-256-gcm';
class EncryptionUtils {
    static encrypt(text) {
        try {
            const key = getEncryptionKey(); // ✅ Use function instead of const
            const iv = crypto_1.default.randomBytes(16);
            const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
        }
        catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }
    static decrypt(encryptedData) {
        try {
            const parts = encryptedData.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted data format');
            }
            const [ivHex, authTagHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const key = getEncryptionKey(); // ✅ Use function instead of const
            const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }
    // ✅ KEEP: Your existing functions unchanged
    static generateApiKey() {
        return 'sk-' + crypto_1.default.randomBytes(32).toString('hex');
    }
    static hashApiKey(apiKey) {
        return crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
    }
    // ✅ ADD: Test function for validation
    static testEncryption() {
        try {
            const testText = 'test-' + Date.now();
            const encrypted = this.encrypt(testText);
            const decrypted = this.decrypt(encrypted);
            return decrypted === testText;
        }
        catch (error) {
            return false;
        }
    }
}
exports.EncryptionUtils = EncryptionUtils;

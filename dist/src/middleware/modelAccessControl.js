"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkModelAccess = checkModelAccess;
exports.validateModelAccess = validateModelAccess;
function checkModelAccess(options, reply) {
    const { allowed_models, model, base_model } = options;
    const modelToUse = model || base_model;
    if (!modelToUse) {
        const error = {
            message: 'No model specified',
            type: 'invalid_request_error',
            code: 'model_required'
        };
        if (reply) {
            reply.code(400).send({ error });
        }
        return { allowed: false, error };
    }
    if (!allowed_models || !allowed_models.includes(modelToUse)) {
        const error = {
            message: `Model '${modelToUse}' not allowed. Allowed models: ${allowed_models?.join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_allowed'
        };
        if (reply) {
            reply.code(403).send({ error });
        }
        return { allowed: false, error };
    }
    return { allowed: true };
}
function validateModelAccess(exportData, model, reply) {
    if (!exportData) {
        reply.code(401).send({
            error: {
                message: 'Authentication required',
                type: 'authentication_error',
                code: 'auth_required'
            }
        });
        return false;
    }
    const result = checkModelAccess({
        allowed_models: exportData.allowed_models,
        model,
        base_model: exportData.base_model
    }, reply);
    return result.allowed;
}

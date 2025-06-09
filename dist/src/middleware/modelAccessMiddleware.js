"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelAccessMiddleware = modelAccessMiddleware;
const modelAccessControl_1 = require("./modelAccessControl");
async function modelAccessMiddleware(openRouterManager, supabase, logger) {
    return async function (request, reply) {
        // Type assertion for our extended request
        const modelRequest = request;
        const body = modelRequest.body || {};
        const model = body.model;
        const exportData = modelRequest.exportedApiData;
        // Skip model validation for non-completion endpoints
        if (request.url === '/api/exported/v1/models') {
            return;
        }
        // Only check model access for chat completion endpoints
        if (!request.url.match(/\/chat\/completions$/)) {
            return;
        }
        // First check basic model access using exported API key settings
        if (!(0, modelAccessControl_1.validateModelAccess)(exportData, model, reply)) {
            return reply;
        }
        // Then check advanced model access based on subscription plan
        if (exportData && model) {
            const advancedCheck = await openRouterManager.checkModelAccess(exportData.user_id, model, supabase, logger);
            if (!advancedCheck.success) {
                return reply.code(403).send({
                    error: {
                        message: advancedCheck.error?.message || 'Model access denied',
                        type: 'invalid_request_error',
                        code: advancedCheck.error?.code || 'model_not_allowed',
                        details: advancedCheck.error?.details
                    }
                });
            }
        }
    };
}

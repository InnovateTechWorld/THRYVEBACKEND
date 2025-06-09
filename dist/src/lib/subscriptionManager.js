"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionManager = void 0;
class SubscriptionManager {
    constructor(supabase, openRouterManager, logger) {
        this.supabase = supabase;
        this.openRouterManager = openRouterManager;
        this.logger = logger;
    }
    /**
     * Get user's current subscription with plan details
     */
    async getUserSubscription(userId) {
        try {
            const { data, error } = await this.supabase
                .rpc('get_user_subscription', { p_user_id: userId });
            if (error) {
                this.logger.error({ msg: 'Failed to get user subscription', error, userId });
                return null;
            }
            return data.length > 0 ? data[0] : null;
        }
        catch (error) {
            this.logger.error({ msg: 'Error getting user subscription', error: error.message, userId });
            return null;
        }
    }
    /**
     * Get user's current limits and usage
     */
    async getUserLimits(userId) {
        try {
            const { data, error } = await this.supabase
                .rpc('check_user_limits', { p_user_id: userId });
            if (error) {
                this.logger.error({ msg: 'Failed to get user limits', error, userId });
                return null;
            }
            return data.length > 0 ? data[0] : null;
        }
        catch (error) {
            this.logger.error({ msg: 'Error getting user limits', error: error.message, userId });
            return null;
        }
    }
    /**
     * Check if user can perform a specific action
     */
    async canUserPerformAction(userId, action) {
        try {
            const subscription = await this.getUserSubscription(userId);
            // If no subscription, user is on free plan
            if (!subscription) {
                const freePlan = await this.getFreePlan();
                if (!freePlan)
                    return false;
                return this.checkActionAgainstPlan(userId, action, freePlan);
            }
            // Check if subscription is active
            if (subscription.status !== 'active') {
                return false;
            }
            // Check if subscription has expired
            if (subscription.current_period_end && new Date(subscription.current_period_end) < new Date()) {
                return false;
            }
            return this.checkActionAgainstSubscription(userId, action, subscription);
        }
        catch (error) {
            this.logger.error({ msg: 'Error checking user action permission', error: error.message, userId, action });
            return false;
        }
    }
    /**
     * Activate a subscription for a user
     */
    async activateSubscription(userId, planId, periodDays = 30) {
        try {
            const plan = await this.getPlan(planId);
            if (!plan) {
                this.logger.error({ msg: 'Plan not found', planId });
                return false;
            }
            const currentPeriodEnd = plan.price === 0 ? null :
                new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();
            const { error } = await this.supabase
                .from('user_subscriptions')
                .upsert({
                user_id: userId,
                plan_id: planId,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: currentPeriodEnd,
                cancelled_at: null
            });
            if (error) {
                this.logger.error({ msg: 'Failed to activate subscription', error, userId, planId });
                return false;
            }
            // If plan includes credits, add them to user's balance
            if (plan.credits > 0) {
                await this.supabase.rpc('update_user_credits', {
                    p_user_id: userId,
                    p_credit_amount: plan.credits,
                    p_transaction_id: null,
                    p_description: `${plan.name} plan credits`
                });
            }
            // Ensure user has OpenRouter API key with appropriate limits
            const { data: credits } = await this.supabase
                .from('user_credit_balances')
                .select('available_credits')
                .eq('user_id', userId)
                .single();
            const creditLimit = credits?.available_credits || 0;
            // Get user email for API key creation
            const { data: authUser } = await this.supabase.auth.getUser();
            const email = authUser.user?.email || '';
            await this.openRouterManager.ensureUserApiKey(userId, email, creditLimit, this.supabase, this.logger);
            this.logger.info({ msg: 'Subscription activated successfully', userId, planId });
            return true;
        }
        catch (error) {
            this.logger.error({ msg: 'Error activating subscription', error: error.message, userId, planId });
            return false;
        }
    }
    /**
     * Cancel user's subscription
     */
    async cancelSubscription(userId) {
        try {
            const { error } = await this.supabase
                .from('user_subscriptions')
                .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString()
            })
                .eq('user_id', userId)
                .eq('status', 'active');
            if (error) {
                this.logger.error({ msg: 'Failed to cancel subscription', error, userId });
                return false;
            }
            // Disable user's OpenRouter API key
            await this.openRouterManager.disableUserApiKey(userId, this.supabase, this.logger);
            this.logger.info({ msg: 'Subscription cancelled successfully', userId });
            return true;
        }
        catch (error) {
            this.logger.error({ msg: 'Error cancelling subscription', error: error.message, userId });
            return false;
        }
    }
    /**
     * Upgrade/downgrade user's subscription
     */
    async changeSubscription(userId, newPlanId) {
        try {
            const currentSubscription = await this.getUserSubscription(userId);
            const newPlan = await this.getPlan(newPlanId);
            if (!newPlan) {
                this.logger.error({ msg: 'New plan not found', newPlanId });
                return false;
            }
            // If upgrading from free to paid or between paid plans
            if (currentSubscription && currentSubscription.price > 0 && newPlan.price > 0) {
                // Handle prorating logic here if needed
                this.logger.info({ msg: 'Plan change requires prorating', userId, newPlanId });
            }
            // Activate new subscription
            return this.activateSubscription(userId, newPlanId);
        }
        catch (error) {
            this.logger.error({ msg: 'Error changing subscription', error: error.message, userId, newPlanId });
            return false;
        }
    }
    /**
     * Check and enforce user limits for exported APIs
     */
    async enforceExportLimits(userId, exportType) {
        try {
            const limits = await this.getUserLimits(userId);
            if (!limits)
                return false;
            if (exportType === 'session') {
                return limits.can_export_session;
            }
            else {
                return limits.can_export_context;
            }
        }
        catch (error) {
            this.logger.error({ msg: 'Error enforcing export limits', error: error.message, userId, exportType });
            return false;
        }
    }
    /**
     * Update user's OpenRouter key limits based on credits
     */
    async updateUserApiKeyLimits(userId) {
        try {
            const { data: credits } = await this.supabase
                .from('user_credit_balances')
                .select('available_credits')
                .eq('user_id', userId)
                .single();
            if (!credits)
                return false;
            const response = await this.openRouterManager.updateUserKeyLimit(userId, credits.available_credits, this.supabase, this.logger);
            return response.success;
        }
        catch (error) {
            this.logger.error({ msg: 'Error updating API key limits', error: error.message, userId });
            return false;
        }
    }
    /**
     * Get all available subscription plans
     */
    async getAllPlans() {
        try {
            const { data: plans, error } = await this.supabase
                .from('subscription_plans')
                .select('*')
                .order('price', { ascending: true });
            if (error) {
                this.logger.error({ msg: 'Failed to fetch subscription plans', error });
                return [];
            }
            return plans || [];
        }
        catch (error) {
            this.logger.error({ msg: 'Error fetching subscription plans', error: error.message });
            return [];
        }
    }
    /**
     * Get a specific plan by ID
     */
    async getPlan(planId) {
        try {
            const { data: plan, error } = await this.supabase
                .from('subscription_plans')
                .select('*')
                .eq('id', planId)
                .single();
            if (error) {
                this.logger.error({ msg: 'Failed to fetch plan', error, planId });
                return null;
            }
            return plan;
        }
        catch (error) {
            this.logger.error({ msg: 'Error fetching plan', error: error.message, planId });
            return null;
        }
    }
    /**
     * Get the free plan
     */
    async getFreePlan() {
        try {
            const { data: plan, error } = await this.supabase
                .from('subscription_plans')
                .select('*')
                .eq('name', 'Free')
                .single();
            if (error) {
                this.logger.error({ msg: 'Failed to fetch free plan', error });
                return null;
            }
            return plan;
        }
        catch (error) {
            this.logger.error({ msg: 'Error fetching free plan', error: error.message });
            return null;
        }
    }
    /**
     * Check action against plan limits
     */
    async checkActionAgainstPlan(userId, action, plan) {
        const limits = await this.getUserLimits(userId);
        if (!limits)
            return false;
        switch (action) {
            case 'create_memory':
                return limits.can_create_memory;
            case 'export_session':
                return limits.can_export_session;
            case 'export_context':
                return limits.can_export_context;
            case 'use_premium_model':
                return !plan.free_models_only;
            default:
                return false;
        }
    }
    /**
     * Check action against current subscription
     */
    async checkActionAgainstSubscription(userId, action, subscription) {
        return this.checkActionAgainstPlan(userId, action, subscription);
    }
    /**
     * Cleanup expired subscriptions (to be run periodically)
     */
    async cleanupExpiredSubscriptions() {
        try {
            const { data: expiredSubs, error } = await this.supabase
                .from('user_subscriptions')
                .update({ status: 'expired' })
                .eq('status', 'active')
                .lt('current_period_end', new Date().toISOString())
                .select('user_id');
            if (error) {
                this.logger.error({ msg: 'Failed to cleanup expired subscriptions', error });
                return 0;
            }
            // Disable OpenRouter keys for expired subscriptions
            if (expiredSubs && expiredSubs.length > 0) {
                for (const sub of expiredSubs) {
                    await this.openRouterManager.disableUserApiKey(sub.user_id, this.supabase, this.logger);
                }
            }
            this.logger.info({ msg: 'Cleaned up expired subscriptions', count: expiredSubs?.length || 0 });
            return expiredSubs?.length || 0;
        }
        catch (error) {
            this.logger.error({ msg: 'Error cleaning up expired subscriptions', error: error.message });
            return 0;
        }
    }
}
exports.SubscriptionManager = SubscriptionManager;

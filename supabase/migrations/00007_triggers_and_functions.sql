-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00007: Triggers and Business Logic Functions
-- ============================================================================

-- ============================================================================
-- DEAL STAGE CHANGE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_deal_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    time_in_stage INTEGER;
BEGIN
    -- Only run if stage actually changed
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        -- Calculate time in previous stage
        time_in_stage := EXTRACT(EPOCH FROM (NOW() - OLD.stage_entered_at))::INTEGER;

        -- Insert stage history record
        INSERT INTO deal_stage_history (
            deal_id,
            from_stage,
            to_stage,
            changed_by,
            time_in_stage_seconds,
            deal_value_snapshot
        ) VALUES (
            NEW.id,
            OLD.stage,
            NEW.stage,
            NEW.updated_by, -- Assumes you add this column or use another method
            time_in_stage,
            COALESCE(NEW.funded_amount, NEW.estimated_value)
        );

        -- Update stage_entered_at
        NEW.stage_entered_at := NOW();

        -- Set timestamps based on stage
        CASE NEW.stage
            WHEN 'proposal_sent' THEN
                NEW.proposal_sent_at := COALESCE(NEW.proposal_sent_at, NOW());
            WHEN 'agreement_signed' THEN
                NEW.agreement_signed_at := COALESCE(NEW.agreement_signed_at, NOW());
            WHEN 'paperwork_submitted' THEN
                NEW.paperwork_submitted_at := COALESCE(NEW.paperwork_submitted_at, NOW());
            WHEN 'custodian_approved' THEN
                NEW.custodian_approved_at := COALESCE(NEW.custodian_approved_at, NOW());
            WHEN 'funds_received' THEN
                NEW.funds_received_at := COALESCE(NEW.funds_received_at, NOW());
            WHEN 'metals_purchased' THEN
                NEW.metals_purchased_at := COALESCE(NEW.metals_purchased_at, NOW());
            WHEN 'closed_won' THEN
                NEW.closed_at := COALESCE(NEW.closed_at, NOW());
            WHEN 'closed_lost' THEN
                NEW.closed_lost_at := COALESCE(NEW.closed_lost_at, NOW());
            ELSE
                -- No specific timestamp for this stage
        END CASE;

        -- Emit system event
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            payload
        ) VALUES (
            'deal_stage_changed',
            'deal.stage.changed',
            NEW.id,
            jsonb_build_object(
                'deal_id', NEW.id,
                'from_stage', OLD.stage,
                'to_stage', NEW.stage,
                'time_in_previous_stage_seconds', time_in_stage,
                'deal_value', COALESCE(NEW.funded_amount, NEW.estimated_value),
                'owner_id', NEW.owner_id
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deal_stage_change
    BEFORE UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION handle_deal_stage_change();

-- ============================================================================
-- DEAL OWNER CHANGE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_deal_owner_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run if owner actually changed
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        -- Emit system event
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            user_id,
            payload
        ) VALUES (
            'deal_owner_changed',
            'deal.owner.changed',
            NEW.id,
            NEW.owner_id,
            jsonb_build_object(
                'deal_id', NEW.id,
                'from_owner_id', OLD.owner_id,
                'to_owner_id', NEW.owner_id,
                'deal_stage', NEW.stage,
                'deal_value', COALESCE(NEW.funded_amount, NEW.estimated_value)
            )
        );

        -- Update assigned_at
        NEW.assigned_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deal_owner_change
    BEFORE UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION handle_deal_owner_change();

-- ============================================================================
-- DEAL CREATION TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_deal_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Set original owner
    NEW.original_owner_id := NEW.owner_id;

    -- Create initial stage history entry
    INSERT INTO deal_stage_history (
        deal_id,
        from_stage,
        to_stage,
        deal_value_snapshot
    ) VALUES (
        NEW.id,
        NULL,
        NEW.stage,
        COALESCE(NEW.estimated_value, 0)
    );

    -- Emit system event
    INSERT INTO system_events (
        event_type,
        event_name,
        deal_id,
        user_id,
        payload
    ) VALUES (
        'deal_created',
        'deal.created',
        NEW.id,
        NEW.owner_id,
        jsonb_build_object(
            'deal_id', NEW.id,
            'deal_type', NEW.deal_type,
            'owner_id', NEW.owner_id,
            'contact_id', NEW.contact_id,
            'lead_id', NEW.lead_id,
            'estimated_value', NEW.estimated_value,
            'campaign_id', NEW.campaign_id,
            'source_type', NEW.source_type
        )
    );

    -- Create revenue summary record
    INSERT INTO deal_revenue_summary (deal_id) VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deal_created
    BEFORE INSERT ON deals
    FOR EACH ROW
    EXECUTE FUNCTION handle_deal_created();

-- ============================================================================
-- FUNDING EVENT TRIGGER (Updates deal revenue summary)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_funding_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Update deal revenue summary
    UPDATE deal_revenue_summary
    SET
        total_funded = (
            SELECT COALESCE(SUM(amount), 0)
            FROM funding_events
            WHERE deal_id = NEW.deal_id
              AND transaction_type = 'deposit'
              AND is_deleted = FALSE
        ),
        total_withdrawn = (
            SELECT COALESCE(SUM(amount), 0)
            FROM funding_events
            WHERE deal_id = NEW.deal_id
              AND transaction_type = 'withdrawal'
              AND is_deleted = FALSE
        ),
        total_metal_cost = (
            SELECT COALESCE(SUM(amount), 0)
            FROM funding_events
            WHERE deal_id = NEW.deal_id
              AND transaction_type = 'metal_purchase'
              AND is_deleted = FALSE
        ),
        total_metal_weight_oz = (
            SELECT COALESCE(SUM(metal_weight_oz), 0)
            FROM funding_events
            WHERE deal_id = NEW.deal_id
              AND transaction_type = 'metal_purchase'
              AND is_deleted = FALSE
        ),
        funding_event_count = (
            SELECT COUNT(*)
            FROM funding_events
            WHERE deal_id = NEW.deal_id
              AND is_deleted = FALSE
        ),
        updated_at = NOW()
    WHERE deal_id = NEW.deal_id;

    -- Calculate net funded and revenue
    UPDATE deal_revenue_summary
    SET
        net_funded = total_funded - total_withdrawn,
        gross_spread = total_funded - total_withdrawn - total_metal_cost,
        gross_revenue = total_funded - total_withdrawn - total_metal_cost,
        net_revenue = gross_revenue - total_commissions
    WHERE deal_id = NEW.deal_id;

    -- Update the deal's funded_amount
    UPDATE deals
    SET
        funded_amount = (SELECT net_funded FROM deal_revenue_summary WHERE deal_id = NEW.deal_id),
        metal_purchase_price = (SELECT total_metal_cost FROM deal_revenue_summary WHERE deal_id = NEW.deal_id),
        spread_amount = (SELECT gross_spread FROM deal_revenue_summary WHERE deal_id = NEW.deal_id),
        gross_revenue = (SELECT gross_revenue FROM deal_revenue_summary WHERE deal_id = NEW.deal_id)
    WHERE id = NEW.deal_id;

    -- Emit event for deposit (funding received)
    IF NEW.transaction_type = 'deposit' THEN
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            payload
        ) VALUES (
            'funding_received',
            'deal.funding.received',
            NEW.deal_id,
            jsonb_build_object(
                'deal_id', NEW.deal_id,
                'funding_event_id', NEW.id,
                'amount', NEW.amount,
                'total_funded', (SELECT net_funded FROM deal_revenue_summary WHERE deal_id = NEW.deal_id)
            )
        );
    END IF;

    -- Emit event for metal purchase
    IF NEW.transaction_type = 'metal_purchase' THEN
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            payload
        ) VALUES (
            'metals_purchased',
            'deal.metals.purchased',
            NEW.deal_id,
            jsonb_build_object(
                'deal_id', NEW.deal_id,
                'funding_event_id', NEW.id,
                'metal_type', NEW.metal_type,
                'weight_oz', NEW.metal_weight_oz,
                'amount', NEW.amount
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_funding_event_insert
    AFTER INSERT ON funding_events
    FOR EACH ROW
    EXECUTE FUNCTION handle_funding_event();

CREATE TRIGGER trigger_funding_event_update
    AFTER UPDATE ON funding_events
    FOR EACH ROW
    EXECUTE FUNCTION handle_funding_event();

-- ============================================================================
-- COMMISSION TRIGGER (Updates deal commission totals)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_commission_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Update deal revenue summary
    UPDATE deal_revenue_summary
    SET
        total_commissions = (
            SELECT COALESCE(SUM(commission_amount), 0)
            FROM commissions
            WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
              AND is_deleted = FALSE
              AND payment_status != 'cancelled'
        ),
        commission_count = (
            SELECT COUNT(*)
            FROM commissions
            WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
              AND is_deleted = FALSE
        ),
        updated_at = NOW()
    WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id);

    -- Recalculate net revenue
    UPDATE deal_revenue_summary
    SET net_revenue = gross_revenue - total_commissions
    WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id);

    -- Update deal's total commission paid
    UPDATE deals
    SET total_commission_paid = (
        SELECT total_commissions
        FROM deal_revenue_summary
        WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
    )
    WHERE id = COALESCE(NEW.deal_id, OLD.deal_id);

    -- Emit event
    IF TG_OP = 'INSERT' THEN
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            user_id,
            payload
        ) VALUES (
            'commission_calculated',
            'commission.created',
            NEW.deal_id,
            NEW.user_id,
            jsonb_build_object(
                'deal_id', NEW.deal_id,
                'user_id', NEW.user_id,
                'commission_id', NEW.id,
                'commission_type', NEW.commission_type,
                'commission_amount', NEW.commission_amount
            )
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_commission_insert
    AFTER INSERT ON commissions
    FOR EACH ROW
    EXECUTE FUNCTION handle_commission_change();

CREATE TRIGGER trigger_commission_update
    AFTER UPDATE ON commissions
    FOR EACH ROW
    EXECUTE FUNCTION handle_commission_change();

CREATE TRIGGER trigger_commission_delete
    AFTER DELETE ON commissions
    FOR EACH ROW
    EXECUTE FUNCTION handle_commission_change();

-- ============================================================================
-- TURNOVER TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_turnover_completed()
RETURNS TRIGGER AS $$
BEGIN
    -- Only handle completed turnovers
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- If full transfer, update deal owner
        IF NEW.is_full_transfer THEN
            UPDATE deals
            SET
                owner_id = NEW.to_user_id,
                secondary_owner_id = NULL,
                secondary_owner_split = 0
            WHERE id = NEW.deal_id;
        ELSE
            -- It's a split
            UPDATE deals
            SET
                owner_id = NEW.to_user_id,
                secondary_owner_id = NEW.from_user_id,
                secondary_owner_split = NEW.from_user_split_percentage
            WHERE id = NEW.deal_id;
        END IF;

        -- Emit event
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            user_id,
            payload
        ) VALUES (
            'turnover_completed',
            'turnover.completed',
            NEW.deal_id,
            NEW.to_user_id,
            jsonb_build_object(
                'deal_id', NEW.deal_id,
                'turnover_id', NEW.id,
                'from_user_id', NEW.from_user_id,
                'to_user_id', NEW.to_user_id,
                'reason', NEW.reason,
                'is_full_transfer', NEW.is_full_transfer,
                'from_split', NEW.from_user_split_percentage,
                'to_split', NEW.to_user_split_percentage
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_turnover_completed
    AFTER INSERT OR UPDATE ON turnovers
    FOR EACH ROW
    EXECUTE FUNCTION handle_turnover_completed();

-- ============================================================================
-- LEAD CONVERSION TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_lead_conversion()
RETURNS TRIGGER AS $$
BEGIN
    -- When lead status changes to 'converted'
    IF NEW.status = 'converted' AND OLD.status != 'converted' THEN
        NEW.converted_at := NOW();

        -- Emit event
        INSERT INTO system_events (
            event_type,
            event_name,
            lead_id,
            user_id,
            payload
        ) VALUES (
            'lead_converted',
            'lead.converted',
            NEW.id,
            NEW.owner_id,
            jsonb_build_object(
                'lead_id', NEW.id,
                'owner_id', NEW.owner_id,
                'contact_id', NEW.converted_contact_id,
                'deal_id', NEW.converted_deal_id,
                'source_type', NEW.source_type,
                'campaign_id', NEW.campaign_id
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_lead_conversion
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION handle_lead_conversion();

-- ============================================================================
-- CALL LOGGING TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_call_logged()
RETURNS TRIGGER AS $$
BEGIN
    -- Emit event for significant calls (answered, duration > 60s)
    IF NEW.disposition = 'answered' OR NEW.duration_seconds > 60 THEN
        INSERT INTO system_events (
            event_type,
            event_name,
            deal_id,
            lead_id,
            user_id,
            payload
        ) VALUES (
            'call_logged',
            'call.logged',
            NEW.deal_id,
            NEW.lead_id,
            NEW.user_id,
            jsonb_build_object(
                'call_id', NEW.id,
                'direction', NEW.direction,
                'disposition', NEW.disposition,
                'duration_seconds', NEW.duration_seconds,
                'from_number', NEW.from_number,
                'to_number', NEW.to_number,
                'recording_url', NEW.recording_url,
                'user_id', NEW.user_id,
                'lead_id', NEW.lead_id,
                'deal_id', NEW.deal_id,
                'campaign_id', NEW.campaign_id
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_call_logged
    AFTER INSERT ON calls
    FOR EACH ROW
    EXECUTE FUNCTION handle_call_logged();

COMMENT ON FUNCTION handle_deal_stage_change() IS 'Tracks stage changes, updates timestamps, emits events';
COMMENT ON FUNCTION handle_deal_created() IS 'Sets up initial deal state, creates revenue summary, emits event';
COMMENT ON FUNCTION handle_funding_event() IS 'Updates deal revenue metrics when funding events occur';
COMMENT ON FUNCTION handle_commission_change() IS 'Maintains commission totals on deals';
COMMENT ON FUNCTION handle_turnover_completed() IS 'Handles deal ownership changes on TO completion';

-- Fix deal stage change trigger - the updated_by column doesn't exist
-- Option 1: Update the trigger to not require updated_by

CREATE OR REPLACE FUNCTION handle_deal_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    time_in_stage INTEGER;
BEGIN
    -- Only run if stage actually changed
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        -- Calculate time in previous stage
        time_in_stage := EXTRACT(EPOCH FROM (NOW() - OLD.stage_entered_at))::INTEGER;

        -- Insert stage history record (without updated_by since column doesn't exist)
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
            NULL, -- changed_by is nullable, set to NULL
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

COMMENT ON FUNCTION handle_deal_stage_change() IS 'Tracks deal stage changes, updates timestamps, and emits events';

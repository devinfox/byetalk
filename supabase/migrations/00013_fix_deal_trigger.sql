-- Fix deal creation trigger - split into BEFORE and AFTER triggers
-- The original trigger tried to insert into deal_stage_history in BEFORE INSERT,
-- but the deal doesn't exist yet so foreign key fails.

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_deal_created ON deals;

-- Create BEFORE INSERT trigger just for setting original_owner_id
CREATE OR REPLACE FUNCTION handle_deal_before_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Set original owner
    NEW.original_owner_id := NEW.owner_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deal_before_insert
    BEFORE INSERT ON deals
    FOR EACH ROW
    EXECUTE FUNCTION handle_deal_before_insert();

-- Create AFTER INSERT trigger for stage history and revenue summary
CREATE OR REPLACE FUNCTION handle_deal_after_insert()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE TRIGGER trigger_deal_after_insert
    AFTER INSERT ON deals
    FOR EACH ROW
    EXECUTE FUNCTION handle_deal_after_insert();

-- Drop the old function if not used elsewhere
DROP FUNCTION IF EXISTS handle_deal_created();

COMMENT ON FUNCTION handle_deal_before_insert() IS 'Sets initial deal values before insert';
COMMENT ON FUNCTION handle_deal_after_insert() IS 'Creates stage history and revenue summary after deal is inserted';

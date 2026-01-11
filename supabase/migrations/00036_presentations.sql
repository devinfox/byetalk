-- ============================================================================
-- BYETALK CRM - Database Schema
-- Migration 00036: Presentation Creator (Canva-like)
-- ============================================================================

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Presentation status enum
CREATE TYPE presentation_status AS ENUM ('draft', 'published', 'archived');

-- ============================================================================
-- PRESENTATIONS TABLE
-- ============================================================================

CREATE TABLE presentations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic info
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status presentation_status NOT NULL DEFAULT 'draft',

    -- Canvas settings
    canvas_width INTEGER NOT NULL DEFAULT 1920,
    canvas_height INTEGER NOT NULL DEFAULT 1080,
    background_color VARCHAR(20) DEFAULT '#FFFFFF',

    -- Template info
    template_id UUID REFERENCES presentations(id),
    is_template BOOLEAN DEFAULT FALSE,
    template_category VARCHAR(50),

    -- Thumbnail
    thumbnail_url TEXT,

    -- Entity linking (similar to documents pattern)
    entity_type VARCHAR(50) DEFAULT 'global',
    entity_id UUID,
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),

    -- Organization (for multi-tenancy)
    organization_id UUID REFERENCES organizations(id),

    -- Ownership
    owner_id UUID NOT NULL REFERENCES users(id),

    -- Statistics
    slide_count INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_presentations_owner ON presentations(owner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_presentations_status ON presentations(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_presentations_template ON presentations(is_template) WHERE is_deleted = FALSE AND is_template = TRUE;
CREATE INDEX idx_presentations_entity ON presentations(entity_type, entity_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_presentations_organization ON presentations(organization_id) WHERE is_deleted = FALSE;

-- ============================================================================
-- SLIDES TABLE
-- ============================================================================

CREATE TABLE presentation_slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent presentation
    presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,

    -- Slide ordering
    slide_order INTEGER NOT NULL DEFAULT 0,

    -- Slide settings
    name VARCHAR(100),
    background_color VARCHAR(20) DEFAULT '#FFFFFF',
    background_image_url TEXT,

    -- Canvas data (Fabric.js JSON)
    canvas_json JSONB NOT NULL DEFAULT '{"version":"6.0.0","objects":[]}',

    -- Thumbnail
    thumbnail_url TEXT,

    -- Speaker notes
    notes TEXT,

    -- Transition
    transition_type VARCHAR(50) DEFAULT 'none',
    transition_duration INTEGER DEFAULT 500,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_slides_presentation ON presentation_slides(presentation_id, slide_order);

-- ============================================================================
-- PRESENTATION ASSETS TABLE (for tracking used images)
-- ============================================================================

CREATE TABLE presentation_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent presentation
    presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,

    -- Asset info
    asset_type VARCHAR(20) NOT NULL, -- 'image', 'video', 'audio'
    source_type VARCHAR(20) NOT NULL, -- 'upload', 'unsplash', 'url'

    -- URLs
    original_url TEXT NOT NULL,
    storage_url TEXT,
    thumbnail_url TEXT,

    -- Metadata
    file_name VARCHAR(255),
    file_size_bytes INTEGER,
    width INTEGER,
    height INTEGER,

    -- Unsplash specific
    unsplash_id VARCHAR(100),
    unsplash_author VARCHAR(200),
    unsplash_author_url TEXT,

    -- Usage tracking
    usage_count INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_presentation ON presentation_assets(presentation_id);
CREATE INDEX idx_assets_unsplash ON presentation_assets(unsplash_id) WHERE unsplash_id IS NOT NULL;

-- ============================================================================
-- PRESENTATION TEMPLATES CATEGORIES
-- ============================================================================

CREATE TABLE presentation_template_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO presentation_template_categories (name, slug, description, icon, display_order) VALUES
    ('Business', 'business', 'Professional business presentations', 'Briefcase', 1),
    ('Marketing', 'marketing', 'Marketing and sales decks', 'TrendingUp', 2),
    ('Education', 'education', 'Educational and training materials', 'GraduationCap', 3),
    ('Creative', 'creative', 'Creative and artistic presentations', 'Palette', 4),
    ('Minimal', 'minimal', 'Clean and minimal designs', 'Square', 5),
    ('Pitch Deck', 'pitch-deck', 'Startup and investor pitch decks', 'Rocket', 6);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentation_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentation_assets ENABLE ROW LEVEL SECURITY;

-- Presentations: Owner, same organization, or public templates
CREATE POLICY presentations_select ON presentations
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            owner_id = get_current_user_id()
            OR organization_id = get_current_organization_id()
            OR is_template = TRUE
        )
    );

CREATE POLICY presentations_insert ON presentations
    FOR INSERT
    WITH CHECK (owner_id = get_current_user_id());

CREATE POLICY presentations_update ON presentations
    FOR UPDATE
    USING (
        owner_id = get_current_user_id()
        OR organization_id = get_current_organization_id()
    );

CREATE POLICY presentations_delete ON presentations
    FOR DELETE
    USING (owner_id = get_current_user_id());

-- Slides: Based on presentation access
CREATE POLICY slides_select ON presentation_slides
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_slides.presentation_id
            AND p.is_deleted = FALSE
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
                OR p.is_template = TRUE
            )
        )
    );

CREATE POLICY slides_insert ON presentation_slides
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_slides.presentation_id
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY slides_update ON presentation_slides
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_slides.presentation_id
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY slides_delete ON presentation_slides
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_slides.presentation_id
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
            )
        )
    );

-- Assets: Based on presentation access
CREATE POLICY assets_select ON presentation_assets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_assets.presentation_id
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY assets_insert ON presentation_assets
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_assets.presentation_id
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY assets_delete ON presentation_assets
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM presentations p
            WHERE p.id = presentation_assets.presentation_id
            AND (
                p.owner_id = get_current_user_id()
                OR p.organization_id = get_current_organization_id()
            )
        )
    );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update slide count on presentation
CREATE OR REPLACE FUNCTION update_presentation_slide_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE presentations SET slide_count = slide_count + 1, updated_at = NOW()
        WHERE id = NEW.presentation_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE presentations SET slide_count = GREATEST(slide_count - 1, 0), updated_at = NOW()
        WHERE id = OLD.presentation_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_slide_count
AFTER INSERT OR DELETE ON presentation_slides
FOR EACH ROW EXECUTE FUNCTION update_presentation_slide_count();

-- Update presentation updated_at when slides change
CREATE OR REPLACE FUNCTION update_presentation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE presentations SET updated_at = NOW()
    WHERE id = NEW.presentation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_presentation_timestamp
AFTER UPDATE ON presentation_slides
FOR EACH ROW EXECUTE FUNCTION update_presentation_timestamp();

-- Auto-set organization_id on insert
CREATE TRIGGER set_presentations_organization
    BEFORE INSERT ON presentations
    FOR EACH ROW
    EXECUTE FUNCTION set_organization_id();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE presentations IS 'Canva-like presentation documents';
COMMENT ON TABLE presentation_slides IS 'Individual slides within presentations with Fabric.js canvas JSON';
COMMENT ON TABLE presentation_assets IS 'Images and media used in presentations (uploads and Unsplash)';
COMMENT ON TABLE presentation_template_categories IS 'Categories for organizing presentation templates';

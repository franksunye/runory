-- Migration: 0036_demo_avatar_svg_paths
-- Description: Point demo identities at deterministic, locally generated SVG
-- avatars. SVG avoids a runtime image service and preserves quality at every
-- UI size.

UPDATE {{SAAS_TABLE_PREFIX}}users
SET avatar_url = REPLACE(avatar_url, '.png', '.svg')
WHERE external_id IN (
  'persona:sales-rep',
  'persona:sales-manager',
  'persona:dispatcher',
  'persona:technician',
  'persona:technician-james',
  'persona:technician-maria',
  'persona:supervisor'
)
AND avatar_url LIKE '/demo/avatars/%.png';

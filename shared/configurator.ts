// Shared configurator constants — single source of truth for allowed spec values
// Backend validates against these, frontend imports same lists (duplicate + test checks match if import not possible)
// Australian English, GST-inclusive AUD

export const ALLOWED_PAPER_COLORS = ['Blush', 'Sage', 'Ivory', 'Dusty Pink', 'Eucalyptus', 'Paper White'] as const;
export type PaperColor = typeof ALLOWED_PAPER_COLORS[number];

export const ALLOWED_PAPER_TEXTURES = ['textured', 'smooth', 'pearl', 'linen'] as const;
export type PaperTexture = typeof ALLOWED_PAPER_TEXTURES[number];

export const ALLOWED_WEIGHTS = ['65lb', '80lb', '110lb'] as const;
export type PaperWeight = typeof ALLOWED_WEIGHTS[number];

// Four canonical flower styles — each must have its own BOM recipe (templateId on BOMRecipe)
export const ALLOWED_TEMPLATES = ['wattle-sprig', 'paper-rose', 'banksia-petal', 'origami-lily'] as const;
export type TemplateId = typeof ALLOWED_TEMPLATES[number];

// Weight labels for customers (stored values unchanged)
export const WEIGHT_LABELS: Record<PaperWeight, { label: string; description: string }> = {
  '65lb': { label: 'Light', description: 'Delicate, airy petals' },
  '80lb': { label: 'Standard', description: 'Balanced strength and softness' },
  '110lb': { label: 'Sturdy', description: 'Bold, sculptural blooms' },
};

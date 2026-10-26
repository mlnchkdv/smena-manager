export const knowledgeFolderOverlay = (width, collapsed = false, contentWidth) => width <= 900 || (contentWidth ?? width - (collapsed ? 56 : 252)) < 850;
export const knowledgeFolderPageSize = (contentWidth, inline = false) => (contentWidth <= 640 ? (inline ? 2 : 4) : 6);

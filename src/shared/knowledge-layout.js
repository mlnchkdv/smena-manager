export const knowledgeFolderOverlay = (width, collapsed = false, contentWidth) => width <= 900 || (contentWidth ?? width - (collapsed ? 56 : 252)) < 850;

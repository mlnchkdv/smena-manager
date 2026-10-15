export const PRODUCT_NAME = 'Smena Manager';
export const PRODUCT_HOST = 'smena-manager.app';

export const productHost = () => (typeof window !== 'undefined' && window.location.host ? window.location.host : PRODUCT_HOST);

export const workspaceHref = (slug, path = '') => {
  const workspace = String(slug || 'workspace').replace(/^\/+|\/+$/g, '');
  const suffix = String(path || '').replace(/^\/+/, '');
  const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : `https://${PRODUCT_HOST}`;
  return `${origin}/${workspace}${suffix ? `/${suffix}` : ''}`;
};

// Keep old shared links useful while maintaining one capabilities page.
location.replace(location.hash === '#english' || new URLSearchParams(location.search).get('lang') === 'en' ? '/product-en.html' : '/product.html');

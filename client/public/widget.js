(function() {
  const scriptTag = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  
  const company = scriptTag.getAttribute('data-company') || 'global';
  const serverUrl = scriptTag.src.split('/widget.js')[0];

  const iframe = document.createElement('iframe');
  iframe.src = `${serverUrl}/widget?company=${encodeURIComponent(company)}`;
  iframe.style.position = 'fixed';
  iframe.style.bottom = '20px';
  iframe.style.right = '20px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '2147483647';
  iframe.style.backgroundColor = 'transparent';
  iframe.allowTransparency = 'true';
  iframe.style.colorScheme = 'normal';
  iframe.style.transition = 'width 0.2s ease, height 0.2s ease';
  
  // Initial small size for just the floating button
  iframe.style.width = '72px';
  iframe.style.height = '72px';

  document.body.appendChild(iframe);

  window.addEventListener('message', (event) => {
    // Make sure the message is from our widget
    if (event.source !== iframe.contentWindow) return;

    try {
      const data = JSON.parse(event.data);
      if (data.type === 'smartticket_widget_resize') {
        if (data.isOpen) {
          iframe.style.width = '380px';
          iframe.style.height = '560px';
          iframe.style.bottom = '0';
          iframe.style.right = '0';
        } else {
          iframe.style.width = '72px';
          iframe.style.height = '72px';
          iframe.style.bottom = '20px';
          iframe.style.right = '20px';
        }
      }
    } catch (e) {}
  });
})();

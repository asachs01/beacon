import { useState, useEffect } from 'react';

/**
 * Detects HA ingress mode and measures the available width.
 * HA's sidebar takes space from the left, and the ingress iframe
 * fills the remaining area. We detect changes by watching for
 * resize events, which fire when HA's sidebar toggles.
 */
export function useIngressDetect() {
  const [isIngress, setIsIngress] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const inIngress = window !== window.parent && !!window.__BEACON_CONFIG__?.ha_token;
    setIsIngress(inIngress);

    if (!inIngress) return;

    // Add ingress class to html element for CSS targeting
    document.documentElement.classList.add('ha-ingress');

    function checkWidth() {
      // When HA sidebar is expanded (~256px), our iframe is narrower
      // When collapsed (~56px), we have more room
      // If iframe width < 900px, HA sidebar is probably expanded — go compact
      setCompact(window.innerWidth < 900);
    }

    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  return { isIngress, compact };
}

/* Icon — bulletproof Lucide wrapper. Renders an empty <span> that React never
   reconciles internally; we inject the SVG via lucide.createIcons(). */
function Icon({ name, size = 20, color, strokeWidth = 2, style = {}, className = '' }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !window.lucide) return;
    el.innerHTML = '<i data-lucide="' + name + '"></i>';
    try { window.lucide.createIcons(); } catch (e) {}
  }, [name, strokeWidth]);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={'ic ' + className}
      style={{ width: size, height: size, color, '--sw': strokeWidth, ...style }}
    />
  );
}

/* Chevron affordance used on clickable cards */
function Chevron() {
  return <span className="chev"><Icon name="chevron-right" size={18} strokeWidth={2.25} /></span>;
}

Object.assign(window, { Icon, Chevron });

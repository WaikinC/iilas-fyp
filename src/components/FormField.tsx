import { cloneElement, isValidElement, ReactElement, ReactNode, useId } from 'react';

/** Give controls a stable label, independent of select options and help text. */
export default function FormField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const labelId = useId();
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-labelledby'?: string }>, { 'aria-labelledby': labelId })
    : children;
  return <label className={`field ${wide ? 'wide' : ''}`}><span id={labelId}>{label}</span>{control}</label>;
}

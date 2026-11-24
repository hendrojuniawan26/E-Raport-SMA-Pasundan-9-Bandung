export const DEFAULT_SCHOOL_LOGO =
  '/assets/aistudio/Desain_tanpa_judul_20261117_173454_0000_0a0b5e52.png';

export function SchoolCrest({
  className = 'w-10 h-10',
  src,
  alt = 'Logo SMA Pasundan 9 Bandung',
}: {
  className?: string;
  src?: string;
  alt?: string;
}) {
  return (
    <img
      src={src || DEFAULT_SCHOOL_LOGO}
      alt={alt}
      referrerPolicy="no-referrer"
      className={`object-contain select-none ${className}`}
    />
  );
}

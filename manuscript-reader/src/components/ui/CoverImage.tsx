import { useEffect, useRef, useState } from 'react';
import { loadCover, saveCover } from '../../engine/storage';

interface CoverImageProps {
  manuscriptId: string;
  title: string;
  /** When true, renders an upload affordance on hover */
  editable?: boolean;
  className?: string;
}

export function CoverImage({ manuscriptId, title, editable = false, className }: CoverImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadCover(manuscriptId).then(url => {
      if (!cancelled) setDataUrl(url);
    });
    return () => { cancelled = true; };
  }, [manuscriptId]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setDataUrl(url);
      saveCover(manuscriptId, url);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className={`cover-image-root${editable ? ' cover-image-root--editable' : ''}${className ? ` ${className}` : ''}`}>
      {dataUrl ? (
        <img className="cover-image-img" src={dataUrl} alt="" />
      ) : (
        <div className="cover-image-placeholder" aria-hidden="true">
          <span className="cover-image-placeholder-title">{title}</span>
        </div>
      )}
      {editable && (
        <>
          <button
            type="button"
            className="cover-image-upload-btn"
            onClick={() => inputRef.current?.click()}
            title={dataUrl ? 'Replace cover image' : 'Upload cover image'}
          >
            {dataUrl ? 'Replace cover' : 'Upload cover'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </>
      )}
    </div>
  );
}

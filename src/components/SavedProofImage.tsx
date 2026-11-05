import {useEffect, useState} from 'react';
import './savedProofImage.css';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maxProofBytes = 10 * 1024 * 1024;

export function isProofImage(contentType: unknown): contentType is string {
  return typeof contentType === 'string' && imageTypes.includes(contentType);
}

type Props = {
  fileName: string;
  contentType: string;
  bytes: number;
  load: (signal: AbortSignal) => Promise<Blob>;
};

type Preview = {state: 'loading' | 'unavailable'} | {state: 'ready'; url: string};

// Mount for one authorised proof. The caller keys the component to the proof and view.
export default function SavedProofImage(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <ProofImageRequest {...props} key={attempt} retry={() => setAttempt(n => n + 1)}/>;
}

function ProofImageRequest({fileName, contentType, bytes, load, retry}: Props & {retry: () => void}) {
  const [preview, setPreview] = useState<Preview>({state: 'loading'});

  useEffect(() => {
    const controller = new AbortController();
    const {signal} = controller;
    let url: string | undefined;
    const releaseUrl = () => {
      if (url) URL.revokeObjectURL(url);
      url = undefined;
    };
    const timer = setTimeout(() => {
      controller.abort();
      releaseUrl();
      setPreview({state: 'unavailable'});
    }, 20_000);

    async function read() {
      try {
        if (!isProofImage(contentType) || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > maxProofBytes) {
          throw Error('Invalid proof image metadata.');
        }
        const blob = await load(signal);
        signal.throwIfAborted();
        if (blob.size !== bytes || blob.type !== contentType) throw Error('The proof image changed.');
        const source = URL.createObjectURL(blob);
        url = source;
        const image = new Image();
        image.src = source;
        await image.decode();
        signal.throwIfAborted();
        if (image.naturalWidth * image.naturalHeight > 24_000_000) throw Error('The proof image is too large to preview.');
        setPreview({state: 'ready', url: source});
      } catch {
        releaseUrl();
        if (!signal.aborted) setPreview({state: 'unavailable'});
      } finally {
        clearTimeout(timer);
      }
    }
    void Promise.resolve().then(() => {
      if (!signal.aborted) return read();
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
      releaseUrl();
    };
  }, [load, bytes, contentType]);

  if (preview.state === 'ready') {
    return <figure className="saved-proof-preview">
      {/* eslint-disable-next-line @next/next/no-img-element -- This Vite view displays a private blob URL. */}
      <img src={preview.url} alt="Saved proof of delivery"/>
      <figcaption>{fileName}</figcaption>
    </figure>;
  }
  return <div className="saved-proof-feedback">
    <p role="status">{preview.state === 'loading' ? 'Loading saved proof image…' : 'The saved proof image is unavailable.'}</p>
    {preview.state === 'unavailable' && <button type="button" onClick={retry}>Retry image preview</button>}
  </div>;
}

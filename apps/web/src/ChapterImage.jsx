import React, { useEffect, useRef, useState } from "react";

export default function ChapterImage({ src, caption }) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => { setFailed(false); }, [src]);
  function close() {
    dialogRef.current?.close();
    setExpanded(false);
    triggerRef.current?.focus();
  }
  return <figure className="chapter-image">
    {failed ? <p role="status" className="chapter-image-error">图片加载失败，请确认章节权限或联系老师重新同步。</p> :
      <button type="button" ref={triggerRef} className="chapter-image-trigger" aria-label={`放大图片：${caption}`} onClick={() => {
        setExpanded(true);
        dialogRef.current?.showModal();
      }}>
        <img src={src} alt={caption} loading="lazy" onError={() => setFailed(true)} />
      </button>}
    <figcaption>{caption}</figcaption>
    <dialog ref={dialogRef} className="chapter-image-dialog" aria-label={`图片预览：${caption}`} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setExpanded(false)}>
      <div className="chapter-image-toolbar"><span>{caption}</span><button type="button" autoFocus onClick={close}>关闭图片</button></div>
      {expanded && <img src={src} alt={caption} onError={() => { setFailed(true); close(); }} />}
    </dialog>
  </figure>;
}

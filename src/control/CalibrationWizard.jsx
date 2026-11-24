import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';

const clampAngle = (v) => Math.min(180, Math.max(0, Math.round(v)));
const clampNeutral = (v) => Math.min(1700, Math.max(1300, Math.round(v)));

/**
 * Tombol tahan untuk menggerakkan servo kontinu jempol selama ditekan,
 * lalu berhenti ke titik neutral segera setelah dilepas.
 */
function HoldButton({ label, getUs, onStart, onStop }) {
  const handleDown = (e) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* beberapa browser tidak mendukung pointer capture */
    }
    onStart(getUs());
  };

  const handleKeyDown = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      onStart(getUs());
    }
  };

  const handleKeyUp = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      onStop();
    }
  };

  return (
    <button
      type="button"
      className="btn wiz-hold-btn"
      onPointerDown={handleDown}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onBlur={onStop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {label}
    </button>
  );
}

/**
 * Wizard kalibrasi jempol (servo kontinu 360°, 4 langkah):
 *   0) Titik diam (neutral)
 *   1) Arah dan kecepatan (dir, power)
 *   2) Waktu tutup (closeMs)
 *   3) Waktu buka (openMs)
 *   4) Selesai & tes
 *
 * Pulsa manual ("U,us") diulang tiap 250 ms; ESP32 menghentikan servo otomatis
 * jika tidak ada perintah pulsa selama >1 detik (pengaman).
 */
function ThumbCalibrationWizard({ savedThumb, send, onSaveThumb, onTest, onNext, onClose }) {
  const { tr } = useI18n();
  const w = tr.wiz;
  const fmtSec = (ms) => `${(ms / 1000).toFixed(2)} ${w.secUnit}`;
  const [step, setStep] = useState(0);
  const [tw, setTw] = useState(() => ({
    neutral: savedThumb?.neutral ?? 1500,
    power: savedThumb?.power ?? 250,
    dir: savedThumb?.dir < 0 ? -1 : 1,
    closeMs: savedThumb?.closeMs ?? 800,
    openMs: savedThumb?.openMs ?? 800,
  }));
  const [timing, setTiming] = useState(false);
  const [displayMs, setDisplayMs] = useState(tw.closeMs);

  const twRef = useRef(tw);
  twRef.current = tw;
  const sendRef = useRef(send);
  sendRef.current = send;

  const runUsRef = useRef(null);
  const keepTimerRef = useRef(null);
  const swTimerRef = useRef(null);
  const t0Ref = useRef(0);
  const lastSentRef = useRef(0);

  const stopStopwatch = useCallback(() => {
    if (swTimerRef.current) {
      clearInterval(swTimerRef.current);
      swTimerRef.current = null;
    }
    setTiming(false);
  }, []);

  const clearRun = useCallback(() => {
    runUsRef.current = null;
    if (keepTimerRef.current) {
      clearInterval(keepTimerRef.current);
      keepTimerRef.current = null;
    }
    stopStopwatch();
  }, [stopStopwatch]);

  const setRun = useCallback((us) => {
    runUsRef.current = us;
    sendRef.current(`U,${us}`);
    if (!keepTimerRef.current) {
      keepTimerRef.current = setInterval(() => {
        if (runUsRef.current != null) sendRef.current(`U,${runUsRef.current}`);
      }, 250);
    }
  }, []);

  const stopHold = useCallback(() => {
    const neutral = twRef.current.neutral;
    if (runUsRef.current !== neutral) setRun(neutral);
  }, [setRun]);

  // Saat masuk langkah 0-3, tahan jempol di titik neutral; saat selesai (langkah 4), hentikan keepalive.
  useEffect(() => {
    stopStopwatch();
    if (step < 4) {
      setRun(twRef.current.neutral);
      if (step === 2) setDisplayMs(twRef.current.closeMs);
      if (step === 3) setDisplayMs(twRef.current.openMs);
    } else {
      clearRun();
    }
  }, [step, setRun, clearRun, stopStopwatch]);

  useEffect(() => clearRun, [clearRun]);

  const clampUs = (v) => Math.min(2000, Math.max(1000, Math.round(v)));
  const closeUs = () => clampUs(twRef.current.neutral + twRef.current.dir * twRef.current.power);
  const openUs = () => clampUs(twRef.current.neutral - twRef.current.dir * twRef.current.power);

  const updateNeutral = (val, immediate = false) => {
    const v = clampNeutral(val);
    setTw((prev) => ({ ...prev, neutral: v }));
    twRef.current = { ...twRef.current, neutral: v };
    runUsRef.current = v;
    const now = performance.now();
    if (immediate || now - lastSentRef.current > 35) {
      lastSentRef.current = now;
      if (immediate) setRun(v);
      else sendRef.current(`U,${v}`);
    }
  };

  const toggleStopwatch = (isClose) => {
    if (!timing) {
      setTiming(true);
      t0Ref.current = performance.now();
      setDisplayMs(0);
      setRun(isClose ? closeUs() : openUs());
      swTimerRef.current = setInterval(() => {
        setDisplayMs(performance.now() - t0Ref.current);
      }, 50);
    } else {
      stopStopwatch();
      setRun(twRef.current.neutral);
      const ms = Math.min(20000, Math.max(100, Math.round(performance.now() - t0Ref.current)));
      setDisplayMs(ms);
      setTw((prev) => (isClose ? { ...prev, closeMs: ms } : { ...prev, openMs: ms }));
    }
  };

  const handleSave = () => {
    clearRun();
    onSaveThumb(twRef.current);
    setStep(4);
  };

  const handleClose = () => {
    clearRun();
    onClose();
  };

  const isCloseStep = step === 2;

  return (
    <>
      <div className="modal-head">
        <div>
          <h2 id="wiz-title" style={{ fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
            {w.thumbTitle}
          </h2>
          <small>{step < 4 ? w.stepOf(step + 1, 4) : w.done}</small>
        </div>
        <button type="button" className="icon-btn" onClick={handleClose} aria-label={w.close}>×</button>
      </div>

      {step === 0 && (
        <>
          <p>
            {w.thumbStep0[0]}<b>{w.thumbStep0[1]}</b>{w.thumbStep0[2]}<b>{w.thumbStep0[3]}</b>{w.thumbStep0[4]}
          </p>
          <div className="big-angle" aria-live="polite">{tw.neutral} µs</div>
          <input
            className="slider"
            type="range"
            min={1300}
            max={1700}
            step={1}
            value={tw.neutral}
            onChange={(e) => updateNeutral(+e.target.value, false)}
            onPointerUp={(e) => setRun(clampNeutral(+e.currentTarget.value))}
            onKeyUp={(e) => setRun(clampNeutral(+e.currentTarget.value))}
            aria-label={w.neutralAria}
          />
          <div className="grid-4">
            {[-5, -1, 1, 5].map((d) => (
              <button key={d} type="button" className="btn btn-sm" onClick={() => updateNeutral(tw.neutral + d, true)}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
          <div className="grid-2">
            <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>{w.next}</button>
            <button type="button" className="btn" onClick={handleClose}>{w.cancel}</button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p>
            {w.thumbStep1[0]}<b>{w.thumbStep1[1]}</b>{w.thumbStep1[2]}<b>{w.thumbStep1[3]}</b>{w.thumbStep1[4]}<b>{w.thumbStep1[5]}</b>{w.thumbStep1[6]}<b>{w.thumbStep1[7]}</b>{w.thumbStep1[8]}
          </p>
          <div className="slider-row">
            <label htmlFor="thumb-power">
              {w.rotSpeed} <output>±{tw.power} µs</output>
            </label>
            <input
              id="thumb-power"
              className="slider"
              type="range"
              min={60}
              max={500}
              step={10}
              value={tw.power}
              onChange={(e) => setTw((prev) => ({ ...prev, power: +e.target.value }))}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={tw.dir < 0}
              onChange={(e) => setTw((prev) => ({ ...prev, dir: e.target.checked ? -1 : 1 }))}
            />
            {w.reverseDir}
          </label>
          <div className="grid-2">
            <HoldButton label={w.holdClose} getUs={closeUs} onStart={setRun} onStop={stopHold} />
            <HoldButton label={w.holdOpen} getUs={openUs} onStart={setRun} onStop={stopHold} />
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            {w.speedWarn}
          </p>
          <div className="grid-2">
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>{w.next}</button>
            <button type="button" className="btn" onClick={() => setStep(0)}>{w.back}</button>
          </div>
        </>
      )}

      {(step === 2 || step === 3) && (
        <>
          <p>
            {isCloseStep ? (
              <>
                {w.thumbStep2[0]}<b>{w.thumbStep2[1]}</b>{w.thumbStep2[2]}<b>{w.thumbStep2[3]}</b>{w.thumbStep2[4]}<b>{w.thumbStep2[5]}</b>{w.thumbStep2[6]}<b>{w.thumbStep2[7]}</b>{w.thumbStep2[8]}
              </>
            ) : (
              <>
                {w.thumbStep3[0]}<b>{w.thumbStep3[1]}</b>{w.thumbStep3[2]}<b>{w.thumbStep3[3]}</b>{w.thumbStep3[4]}<b>{w.thumbStep3[5]}</b>{w.thumbStep3[6]}<b>{w.thumbStep3[7]}</b>{w.thumbStep3[8]}
              </>
            )}
          </p>
          <div className="big-angle" aria-live="polite">{fmtSec(displayMs)}</div>
          <button
            type="button"
            className={`btn btn-big ${timing ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => toggleStopwatch(isCloseStep)}
          >
            {timing ? w.stop : w.start}
          </button>
          <div className="grid-2">
            <HoldButton label={w.holdClose} getUs={closeUs} onStart={setRun} onStop={stopHold} />
            <HoldButton label={w.holdOpen} getUs={openUs} onStart={setRun} onStop={stopHold} />
          </div>
          <div className="grid-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={timing}
              onClick={isCloseStep ? () => setStep(3) : handleSave}
            >
              {isCloseStep ? w.next : w.save}
            </button>
            <button
              type="button"
              className="btn"
              disabled={timing}
              onClick={() => setStep(isCloseStep ? 1 : 2)}
            >
              {w.back}
            </button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <p>{w.thumbDone(tw)}</p>
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => onTest(1)}>{w.testClose}</button>
            <button type="button" className="btn" onClick={() => onTest(0)}>{w.testOpen}</button>
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            {w.thumbDoneHint}
          </p>
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setStep(0)}>{w.retry}</button>
            <button type="button" className="btn btn-primary" onClick={onNext}>{w.calibrateNext(tr.fingers[1])}</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose} style={{ justifySelf: 'start' }}>
            {w.close}
          </button>
        </>
      )}
    </>
  );
}

/**
 * Wizard kalibrasi 4 jari (servo 180°, index 1-4) dalam dua langkah: sudut buka, lalu sudut tutup.
 * send("W,i,sudut") menggerakkan servo tanpa menyimpan. send("A,i,buka,tutup") menyimpan di ESP32.
 */
function FingerCalibrationWizard({ index, name, savedOpen, savedClose, send, onSave, onTest, onNext, onClose }) {
  const { tr } = useI18n();
  const w = tr.wiz;
  const [step, setStep] = useState(0);
  const [angle, setAngle] = useState(() => clampAngle(savedOpen));
  const [openVal, setOpenVal] = useState(() => clampAngle(savedOpen));
  const [closeVal, setCloseVal] = useState(() => clampAngle(savedClose));
  const lastSent = useRef(0);

  const sendAngle = (a, force = false) => {
    const now = performance.now();
    if (!force && now - lastSent.current < 35) return;
    lastSent.current = now;
    send(`W,${index},${clampAngle(a)}`);
  };

  const change = (a, force = false) => {
    const v = clampAngle(a);
    setAngle(v);
    sendAngle(v, force);
  };

  const saveOpen = () => {
    const v = clampAngle(angle);
    setOpenVal(v);
    setStep(1);
    setAngle(clampAngle(closeVal));
  };

  const saveClose = () => {
    const v = clampAngle(angle);
    setCloseVal(v);
    onSave(openVal, v);
    setStep(2);
  };

  const isOpen = step === 0;

  return (
    <>
      <div className="modal-head">
        <div>
          <h2 id="wiz-title" style={{ fontSize: '1.125rem', letterSpacing: '-0.02em' }}>{w.fingerTitle(name)}</h2>
          <small>{step < 2 ? w.stepOf(step + 1, 2) : w.done}</small>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={w.close}>×</button>
      </div>

      {step < 2 ? (
        <>
          <p>{isOpen ? w.fingerOpenDesc : w.fingerCloseDesc}</p>
          <p className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            {w.savedAngles(savedOpen, savedClose)}
          </p>
          <div className="big-angle" aria-live="polite">{clampAngle(angle)}°</div>
          <input
            className="slider"
            type="range"
            min={0}
            max={180}
            step={1}
            value={clampAngle(angle)}
            onChange={(e) => change(+e.target.value)}
            onPointerUp={(e) => sendAngle(+e.currentTarget.value, true)}
            onKeyUp={(e) => sendAngle(+e.currentTarget.value, true)}
            aria-label={w.servoAngleAria}
          />
          <div className="grid-4">
            {[-5, -1, 1, 5].map((d) => (
              <button key={d} type="button" className="btn btn-sm" onClick={() => change(angle + d, true)}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
          <div className="grid-2">
            <button type="button" className="btn btn-primary" onClick={isOpen ? saveOpen : saveClose}>
              {isOpen ? w.saveOpenPos : w.saveClosePos}
            </button>
            <button type="button" className="btn" onClick={onClose}>{w.cancel}</button>
          </div>
        </>
      ) : (
        <>
          <p>{w.fingerDone(name, openVal, closeVal)}</p>
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => onTest(1)}>{w.testClose}</button>
            <button type="button" className="btn" onClick={() => onTest(0)}>{w.testOpen}</button>
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            {w.fingerDoneHint}
          </p>
          <div className="grid-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStep(0);
                setAngle(openVal);
              }}
            >
              {w.retry}
            </button>
            {index < 4 ? (
              <button type="button" className="btn btn-primary" onClick={onNext}>
                {w.calibrateNext(tr.fingers[index + 1])}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onClose}>{w.finish}</button>
            )}
          </div>
          {index < 4 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} style={{ justifySelf: 'start' }}>
              {w.close}
            </button>
          )}
        </>
      )}
    </>
  );
}

export default function CalibrationWizard(props) {
  const { index, onClose } = props;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiz-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        {index === 0 ? <ThumbCalibrationWizard {...props} /> : <FingerCalibrationWizard {...props} />}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

// Protokol (lihat server.js dan firmware/esp32_hand.ino):
//   server -> browser: {type:'status'}, {type:'ports'}, {type:'cfg'}, {type:'pos'}, {type:'error'}
//   browser -> server: "p,p,p,p,p" target 0-100 | "A,i,buka,tutup" (i=1-4) | "W,i,sudut" (i=1-4) | "V,speed" | "G"
//                      "C,neutral,power,dir,closeMs,openMs" | "U,us" | "Z,pos" (jempol 360°)
//                      "L,strip,animasi,r,g,b,kecerahan,kecepatan" (LED strip WS2812B)
//                      JSON {type:'mode'|'ports'|'serial'} untuk kontrol koneksi

const EMPTY_STATUS = { mode: 'wifi', esp: 0, serialAvailable: false, serial: false, serialPath: '' };

export function useRobotSocket({ enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [ports, setPorts] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [pos, setPos] = useState(null);
  const [error, setError] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setStatus(EMPTY_STATUS);
      return undefined;
    }
    let alive = true;
    let timer = null;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let ws;
      try {
        ws = new WebSocket(`${proto}//${location.host}/browser`);
      } catch {
        timer = setTimeout(connect, 3500);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        setConnected(true);
        setError('');
        ws.send('G');
      };
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
        setStatus(EMPTY_STATUS);
        timer = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (m.type) {
          case 'status': setStatus(m); break;
          case 'ports': setPorts(m.ports || []); break;
          case 'cfg': setCfg(m); break;
          case 'pos': setPos(m.p); break;
          case 'error': setError(m.msg); break;
          default: break;
        }
      };
    };

    connect();
    return () => {
      alive = false;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [enabled]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(msg);
  }, []);

  const sendJson = useCallback((obj) => send(JSON.stringify(obj)), [send]);

  return { connected, status, ports, cfg, pos, error, send, sendJson };
}

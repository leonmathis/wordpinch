"use client";

import * as React from "react";

export function QR() {
  const grid = React.useMemo(() => {
    const arr: boolean[] = [];
    let s = 0x9f3a;
    for (let i = 0; i < 21 * 21; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      arr.push(((s >> 8) & 1) === 1);
    }
    const setSquare = (x: number, y: number) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const inner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          arr[(y + dy) * 21 + (x + dx)] = edge || inner;
        }
      }
    };
    setSquare(0, 0);
    setSquare(14, 0);
    setSquare(0, 14);
    return arr;
  }, []);

  return (
    <div className="qr">
      {grid.map((on, i) => (
        <i key={i} data-on={on ? "true" : "false"} />
      ))}
    </div>
  );
}

// Pulls the text out of a pay stub PDF on the phone, with no library and nothing sent anywhere.
// Handles what payroll statements use: standard fonts, plain or Flate-compressed page content.
// The text then goes through the same stub reader as a paste, which ignores names, addresses,
// employee numbers and account numbers.

const MONEY = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/;

const latin1 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
};

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate');
    const out = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(out).arrayBuffer());
  } catch {
    return null;
  }
}

// PDF literal string body (between the outer parentheses) to text.
function unescape(s) {
  return s.replace(/\\(\r\n|\n|\r|[0-7]{1,3}|.)/g, (m, c) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] ?? (/^[\r\n]/.test(c) ? '' : c);
  });
}

// Tokenize a content stream into numbers, strings, arrays, names and operators.
function tokens(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < n && depth) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '(') depth++;
        else if (src[j] === ')') depth--;
        j++;
      }
      out.push({ t: 'str', v: unescape(src.slice(i + 1, j - 1)) });
      i = j;
      continue;
    }
    if (c === '<' && src[i + 1] !== '<') {
      const j = src.indexOf('>', i);
      const hex = src.slice(i + 1, j).replace(/\s/g, '');
      let v = '';
      for (let k = 0; k < hex.length; k += 2) v += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (c === '[' || c === ']') { out.push({ t: c }); i++; continue; }
    if (c === '<' || c === '>') { i += 2; out.push({ t: 'dict' }); continue; }
    let j = i;
    while (j < n && !/[\s()<>[\]/%]/.test(src[j])) j++;
    if (j === i) j = i + 1;
    const w = src.slice(i, j);
    if (c === '/') {
      let k = i + 1;
      while (k < n && !/[\s()<>[\]/%]/.test(src[k])) k++;
      out.push({ t: 'name', v: src.slice(i + 1, k) });
      i = k;
      continue;
    }
    out.push(/^[-+]?(\d+\.?\d*|\.\d+)$/.test(w) ? { t: 'num', v: Number(w) } : { t: 'op', v: w });
    i = j;
  }
  return out;
}

// Text runs with their position on the page: { x, y, size, text }.
export function textRuns(content) {
  const runs = [];
  let stack = [];
  let arr = null;
  let tm = [1, 0, 0, 1, 0, 0];
  let lm = [1, 0, 0, 1, 0, 0];
  let size = 10;
  let leading = 0;
  const move = (tx, ty) => {
    lm = [lm[0], lm[1], lm[2], lm[3], lm[4] + tx * lm[0] + ty * lm[2], lm[5] + tx * lm[1] + ty * lm[3]];
    tm = lm.slice();
  };
  const show = (text) => {
    if (!text) return;
    const scale = Math.hypot(tm[0], tm[1]) || 1;
    runs.push({ x: tm[4], y: tm[5], size: size * scale, text });
    tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + text.length * size * 0.5 * tm[0], tm[5]];
  };
  for (const tok of tokens(content)) {
    if (tok.t === '[') { arr = []; continue; }
    if (tok.t === ']') { stack.push({ t: 'arr', v: arr || [] }); arr = null; continue; }
    if (arr) { arr.push(tok); continue; }
    if (tok.t !== 'op') { stack.push(tok); continue; }
    const nums = stack.filter((s) => s.t === 'num').map((s) => s.v);
    const last = stack[stack.length - 1];
    switch (tok.v) {
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; lm = tm.slice(); break;
      case 'Tm': if (nums.length >= 6) { tm = nums.slice(-6); lm = tm.slice(); } break;
      case 'Td': if (nums.length >= 2) move(nums[nums.length - 2], nums[nums.length - 1]); break;
      case 'TD': if (nums.length >= 2) { leading = -nums[nums.length - 1]; move(nums[nums.length - 2], nums[nums.length - 1]); } break;
      case 'TL': if (nums.length) leading = nums[nums.length - 1]; break;
      case 'T*': move(0, -leading); break;
      case 'Tf': if (nums.length) size = nums[nums.length - 1]; break;
      case 'Tj': if (last?.t === 'str') show(last.v); break;
      case "'": move(0, -leading); if (last?.t === 'str') show(last.v); break;
      case '"': move(0, -leading); if (last?.t === 'str') show(last.v); break;
      case 'TJ':
        if (last?.t === 'arr') {
          // Big negative kerning between pieces is a visible gap: keep it as a space.
          const text = last.v.map((p) => (p.t === 'str' ? p.v : p.t === 'num' && p.v < -200 ? ' ' : '')).join('');
          show(text);
        }
        break;
      default: break;
    }
    stack = [];
  }
  return runs;
}

// Rows top to bottom. A row splits where a new label starts after an amount, or across a wide gap,
// so two columns side by side come out as two lines (the way the stub reader expects).
export function runsToLines(runs) {
  const rows = [];
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const r of sorted) {
    const row = rows.find((w) => Math.abs(w.y - r.y) <= Math.max(1.5, r.size * 0.3));
    if (row) row.runs.push(r);
    else rows.push({ y: r.y, runs: [r] });
  }
  const lines = [];
  for (const row of rows.sort((a, b) => b.y - a.y)) {
    const rs = row.runs.sort((a, b) => a.x - b.x);
    let cur = [];
    let prev = null;
    for (const r of rs) {
      const t = r.text.trim();
      if (!t) continue;
      const isMoney = MONEY.test(t);
      const gap = prev ? r.x - (prev.x + prev.text.length * prev.size * 0.5) : 0;
      if (prev && !isMoney && (MONEY.test(prev.text.trim()) || gap > r.size * 6)) {
        lines.push(cur.join(' '));
        cur = [];
      }
      cur.push(t);
      prev = r;
    }
    if (cur.length) lines.push(cur.join(' '));
  }
  return lines;
}

// bytes: Uint8Array of the PDF file. Returns the text, one line per row segment, pages in order.
export async function pdfText(bytes) {
  const src = latin1(bytes);
  if (!src.startsWith('%PDF')) throw new Error('Not a PDF');
  const lines = [];
  const re = /(?<!end)stream[ \t]*(\r\n|\n|\r)/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('endstream', start);
    if (end < 0) break;
    const head = src.slice(Math.max(0, src.lastIndexOf('obj', m.index)), m.index);
    if (/\/Subtype\s*\/(Image|XML)|\/Type\s*\/(Metadata|XRef|ObjStm)|\/(DCTDecode|RunLengthDecode|JPXDecode|CCITTFaxDecode|ASCII85Decode|LZWDecode)/.test(head)) continue;
    // Use the declared length when it's a plain number; otherwise drop the line break before endstream.
    const len = head.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let stop = end;
    if (len && start + Number(len[1]) <= end) stop = start + Number(len[1]);
    else while (stop > start && (src[stop - 1] === '\n' || src[stop - 1] === '\r')) stop--;
    let body = bytes.subarray(start, stop);
    if (/\/FlateDecode/.test(head)) {
      const inf = await inflate(body);
      if (!inf) continue;
      body = inf;
    }
    const text = latin1(body);
    if (!/\b(Tj|TJ)\b/.test(text)) continue;
    lines.push(...runsToLines(textRuns(text)));
    re.lastIndex = end;
  }
  return lines.join('\n');
}

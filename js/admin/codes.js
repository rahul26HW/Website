/* Home Weavers — the two codes printed on a packing slip.

   A QR code so the customer can scan their way to the review form, and a Code 128
   barcode for the returns desk. Both are drawn here rather than fetched from an
   image service: a slip is generated with the customer's order number on it, and
   that is not something to hand to a third party for the sake of a picture.

   Byte mode, error correction level M, versions 1 to 10 — which covers any URL up
   to 213 characters. Everything below follows ISO/IEC 18004. */
(function (HW) {
  'use strict';

  /* ---------- GF(256), the field QR does its arithmetic in ---------- */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    for (var i = 0, x = 1; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;          /* the QR primitive polynomial */
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* The generator polynomial for n error-correction codewords. */
  function genPoly(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(g.length + 1).fill(0);
      /* Coefficients run highest power first. Multiplying by (x + a) shifts each one up
         a power and adds a times itself one place along — the other way round builds the
         polynomial backwards, which still produces plausible-looking output that no
         scanner can read. */
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function ecBytes(data, n) {
    var g = genPoly(n), rem = data.concat(new Array(n).fill(0));
    for (var i = 0; i < data.length; i++) {
      var f = rem[i];
      if (!f) continue;
      for (var j = 0; j < g.length; j++) rem[i + j] ^= mul(g[j], f);
    }
    return rem.slice(data.length);
  }

  /* ---------- the tables ---------- *
     Per version at level M: [ec codewords per block, blocks in group 1,
     data codewords each, blocks in group 2, data codewords each]. */
  var RS = {
    1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };
  function dataCapacity(v) { var r = RS[v]; return r[1] * r[2] + r[3] * r[4]; }

  /* ---------- encode the text into data codewords ---------- */
  function encode(text, version) {
    var bytes = [], i;
    /* Byte mode is defined over 8-bit values, so the text goes in as UTF-8. */
    var utf8 = unescape(encodeURIComponent(text));
    for (i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xFF);

    var bits = [];
    function put(value, len) { for (var b = len - 1; b >= 0; b--) bits.push((value >> b) & 1); }
    put(4, 4);                                   /* mode: byte */
    put(bytes.length, version < 10 ? 8 : 16);    /* character count */
    for (i = 0; i < bytes.length; i++) put(bytes[i], 8);

    var capacityBits = dataCapacity(version) * 8;
    put(0, Math.min(4, capacityBits - bits.length));   /* terminator */
    while (bits.length % 8) bits.push(0);

    var words = [];
    for (i = 0; i < bits.length; i += 8) {
      var w = 0;
      for (var k = 0; k < 8; k++) w = (w << 1) | bits[i + k];
      words.push(w);
    }
    /* The two pad bytes the standard names, alternating until the version is full. */
    var pads = [0xEC, 0x11], p = 0;
    while (words.length < dataCapacity(version)) words.push(pads[p++ % 2]);
    return words;
  }

  /* Data and error-correction codewords, interleaved the way the standard asks. */
  function finalWords(words, version) {
    var r = RS[version], blocks = [], ecs = [], at = 0, i;
    function take(count) { var out = words.slice(at, at + count); at += count; return out; }
    for (i = 0; i < r[1]; i++) blocks.push(take(r[2]));
    for (i = 0; i < r[3]; i++) blocks.push(take(r[4]));
    for (i = 0; i < blocks.length; i++) ecs.push(ecBytes(blocks[i], r[0]));

    var out = [], max = Math.max(r[2], r[4]);
    for (i = 0; i < max; i++) {
      for (var b = 0; b < blocks.length; b++) if (i < blocks[b].length) out.push(blocks[b][i]);
    }
    for (i = 0; i < r[0]; i++) {
      for (var e = 0; e < ecs.length; e++) out.push(ecs[e][i]);
    }
    return out;
  }

  /* ---------- the matrix ---------- */
  function newMatrix(size) {
    var m = [];
    for (var i = 0; i < size; i++) m.push(new Array(size).fill(null));
    return m;
  }

  function placeFunctions(m, version) {
    var size = m.length, i, j;
    function finder(r, c) {
      for (i = -1; i <= 7; i++) {
        for (j = -1; j <= 7; j++) {
          var rr = r + i, cc = c + j;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          var on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                   (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                   (i >= 2 && i <= 4 && j >= 2 && j <= 4);
          m[rr][cc] = on ? 1 : 0;
        }
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    for (i = 8; i < size - 8; i++) {            /* timing */
      var bit = (i % 2 === 0) ? 1 : 0;
      if (m[6][i] === null) m[6][i] = bit;
      if (m[i][6] === null) m[i][6] = bit;
    }

    var centres = ALIGN[version];
    for (var a = 0; a < centres.length; a++) {
      for (var b = 0; b < centres.length; b++) {
        var r = centres[a], c = centres[b];
        if (m[r][c] !== null) continue;         /* skips the three finder corners */
        for (i = -2; i <= 2; i++) {
          for (j = -2; j <= 2; j++) {
            m[r + i][c + j] = (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) ? 1 : 0;
          }
        }
      }
    }
    m[size - 8][8] = 1;                          /* the dark module */

    /* Reserve the format areas so data placement steps over them. */
    for (i = 0; i <= 8; i++) {
      if (m[8][i] === null) m[8][i] = 0;
      if (m[i][8] === null) m[i][8] = 0;
    }
    for (i = size - 8; i < size; i++) {
      if (m[8][i] === null) m[8][i] = 0;
      if (m[i][8] === null) m[i][8] = 0;
    }
    if (version >= 7) {
      for (i = 0; i < 6; i++) {
        for (j = 0; j < 3; j++) {
          m[size - 11 + j][i] = 0;
          m[i][size - 11 + j] = 0;
        }
      }
    }
  }

  /* True where a module belongs to a function pattern and must not take data. */
  function reservedMask(version, size) {
    var r = newMatrix(size);
    placeFunctions(r, version);
    return r;
  }

  function placeData(m, reserved, words) {
    var size = m.length, bitIndex = 0, up = true;
    function bitAt(n) {
      var w = words[n >> 3];
      return w === undefined ? 0 : (w >> (7 - (n & 7))) & 1;
    }
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;                      /* the vertical timing column is skipped */
      for (var n = 0; n < size; n++) {
        var row = up ? size - 1 - n : n;
        for (var k = 0; k < 2; k++) {
          var c = col - k;
          if (reserved[row][c] !== null) continue;
          m[row][c] = bitAt(bitIndex++);
        }
      }
      up = !up;
    }
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; },
  ];

  /* The four penalties the standard defines, used to pick the mask that
     produces the least awkward pattern for a scanner. */
  function penalty(m) {
    var size = m.length, score = 0, i, j, run, last;
    for (i = 0; i < size; i++) {
      run = 1; last = m[i][0];
      for (j = 1; j < size; j++) {
        if (m[i][j] === last) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[i][j]; }
      }
      if (run >= 5) score += 3 + (run - 5);
      run = 1; last = m[0][i];
      for (j = 1; j < size; j++) {
        if (m[j][i] === last) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[j][i]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (i = 0; i < size - 1; i++) {
      for (j = 0; j < size - 1; j++) {
        var v = m[i][j];
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
      }
    }
    var PAT = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    function runs(line) {
      for (var s = 0; s + 11 <= size; s++) {
        var hit = true;
        for (var t = 0; t < 11; t++) if (line[s + t] !== PAT[t]) { hit = false; break; }
        if (hit) score += 40;
        hit = true;
        for (t = 0; t < 11; t++) if (line[s + t] !== PAT[10 - t]) { hit = false; break; }
        if (hit) score += 40;
      }
    }
    for (i = 0; i < size; i++) {
      runs(m[i]);
      var colLine = [];
      for (j = 0; j < size; j++) colLine.push(m[j][i]);
      runs(colLine);
    }
    var dark = 0;
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) dark += m[i][j];
    score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return score;
  }

  /* Format and version information, both protected by their own BCH codes. */
  function formatBits(mask) {
    var data = (0x00 << 3) | mask;              /* 00 = error correction level M */
    var rem = data << 10;
    for (var i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(version) {
    var rem = version << 12;
    for (var i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1F25 << (i - 12);
    return (version << 12) | rem;
  }

  /* The fifteen format bits are written twice, once around the top-left finder and
     once split between the other two, so a scanner that loses a corner can still
     read them. The two copies run along different axes — getting that the wrong way
     round produces a code that looks perfectly plausible and decodes to nothing. */
  function placeFormat(m, mask) {
    var size = m.length, bits = formatBits(mask), i;
    for (i = 0; i < 15; i++) {
      var b = (bits >> i) & 1;
      if (i < 6) m[i][8] = b;
      else if (i < 8) m[i + 1][8] = b;
      else m[size - 15 + i][8] = b;

      if (i < 8) m[8][size - i - 1] = b;
      else if (i === 8) m[8][7] = b;
      else m[8][14 - i] = b;
    }
    m[size - 8][8] = 1;
  }
  function placeVersion(m, version) {
    if (version < 7) return;
    var size = m.length, bits = versionBits(version);
    for (var i = 0; i < 18; i++) {
      var b = (bits >> i) & 1, r = Math.floor(i / 3), c = i % 3;
      m[size - 11 + c][r] = b;
      m[r][size - 11 + c] = b;
    }
  }

  /* ---------- the one function the rest of the site calls ---------- */
  HW.qr = function (text) {
    var version = 1;
    var utf8Len = unescape(encodeURIComponent(String(text || ''))).length;
    while (version <= 10 && utf8Len + (version < 10 ? 2 : 3) > dataCapacity(version)) version++;
    if (version > 10) throw new Error('Too long for a QR code this size.');

    var size = version * 4 + 17;
    var words = finalWords(encode(String(text || ''), version), version);
    var reserved = reservedMask(version, size);

    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var m = newMatrix(size);
      placeFunctions(m, version);
      placeData(m, reserved, words);
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (reserved[r][c] === null && MASKS[mask](r, c)) m[r][c] ^= 1;
        }
      }
      placeFormat(m, mask);
      placeVersion(m, version);
      var p = penalty(m);
      if (!best || p < best.p) best = { p: p, m: m };
    }
    return best.m;
  };

  /* An SVG, because the slip is printed and a printer should be given shapes
     rather than a small picture to enlarge. */
  HW.qrSvg = function (text, px, quiet) {
    var m = HW.qr(text), n = m.length, q = quiet == null ? 4 : quiet, total = n + q * 2;
    var d = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="qr" width="' + (px || 110) + '" height="' + (px || 110) + '" viewBox="0 0 ' + total + ' ' + total +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="' + total + '" height="' + total +
      '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  };

  /* ---------- Code 128, for the returns desk ---------- *
     Code set B throughout: it covers the digits and capitals an order number uses,
     and avoids the mode switching that set C would need. */
  var C128 = [
    '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000',
    '10011000100', '10001100100', '11001001000', '11001000100', '11000100100', '10110011100', '10011011100',
    '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', '11001001110',
    '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100',
    '11100110100', '11100110010', '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
    '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
    '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110',
    '11010001110', '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110',
    '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010',
    '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
    '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000',
    '11110111010', '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
    '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110', '11011110110',
    '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000',
    '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
    '11010011100', '1100011101011',
  ];
  HW.code128Svg = function (text, width, height) {
    var s = String(text || '').replace(/[^\x20-\x7E]/g, ''), i;
    var codes = [104];                           /* Start B */
    for (i = 0; i < s.length; i++) codes.push(s.charCodeAt(i) - 32);
    var sum = 104;
    for (i = 1; i < codes.length; i++) sum += codes[i] * i;
    codes.push(sum % 103);
    codes.push(106);                             /* Stop */

    var bits = codes.map(function (c) { return C128[c]; }).join('');
    var d = '', x = 0;
    for (i = 0; i < bits.length; i++) {
      if (bits[i] === '1') d += 'M' + x + ' 0h1v1h-1z';
      x++;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="barcode" width="' + (width || 150) + '" height="' + (height || 34) +
      '" viewBox="0 0 ' + bits.length + ' 1" preserveAspectRatio="none" shape-rendering="crispEdges" ' +
      'role="img" aria-label="' + HW.u.esc(s) + '"><path d="' + d + '" fill="#000"/></svg>';
  };
})(window.HW = window.HW || {});

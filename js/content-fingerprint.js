// Deterministic content fingerprint also works on HTTP LAN/iPad connections,
// where SubtleCrypto is unavailable. This is an identity key, not a security hash.
function scoreContentFingerprint(text, domain = '') {
    let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    for (let i = 0; i < domain.length + text.length; i++) {
        const offset = i - domain.length;
        const k = offset < 0 ? domain.charCodeAt(i) : typeof text === 'string' ? text.charCodeAt(offset) : text[offset];
        a = b ^ Math.imul(a ^ k, 597399067);
        b = c ^ Math.imul(b ^ k, 2869860233);
        c = d ^ Math.imul(c ^ k, 951274213);
        d = a ^ Math.imul(d ^ k, 2716044179);
    }
    a = Math.imul(c ^ (a >>> 18), 597399067);
    b = Math.imul(d ^ (b >>> 22), 2869860233);
    c = Math.imul(a ^ (c >>> 17), 951274213);
    d = Math.imul(b ^ (d >>> 19), 2716044179);
    return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

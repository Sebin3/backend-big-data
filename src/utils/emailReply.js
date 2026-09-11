/** Elimina el mensaje anterior que Gmail/Outlook añade debajo de una respuesta. */
export function cleanEmailReply(text = '') {
  const normalized = String(text).replace(/\r\n/g, '\n')
  const markers = [
    /^El [\s\S]{0,700}?escribió:\s*$/im,
    /^On [\s\S]{0,700}?wrote:\s*$/im,
    /^-{2,}\s*(Mensaje original|Original Message)\s*-{2,}\s*$/im,
    /^(De|From):\s.+$/im,
  ]
  let end = normalized.length
  for (const marker of markers) {
    const match = marker.exec(normalized)
    if (match && match.index < end) end = match.index
  }
  return normalized
    .slice(0, end)
    .replace(/^>.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

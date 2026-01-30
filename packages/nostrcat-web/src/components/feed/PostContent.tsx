'use client'

import { useMemo } from 'react'
import Link from 'next/link'

interface PostContentProps {
  content: string
}

type ContentPart =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'url'; value: string }
  | { type: 'image'; value: string }

// URL 正则
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi

// 图片 URL 正则
const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i

// Hashtag 正则
const HASHTAG_REGEX = /#(\w+)/g

// Nostr mention 正则 (npub, note, nevent)
const NOSTR_MENTION_REGEX = /(nostr:)?(npub1[a-z0-9]{58}|note1[a-z0-9]{58}|nevent1[a-z0-9]+)/gi

export function PostContent({ content }: PostContentProps) {
  const parts = useMemo(() => {
    const result: ContentPart[] = []
    let remaining = content

    // 提取所有匹配项及其位置
    const matches: { start: number; end: number; part: ContentPart }[] = []

    // 查找 URLs
    let match
    const urlRegex = new RegExp(URL_REGEX.source, 'gi')
    while ((match = urlRegex.exec(content)) !== null) {
      const url = match[0]
      const isImage = IMAGE_REGEX.test(url)
      matches.push({
        start: match.index,
        end: match.index + url.length,
        part: isImage ? { type: 'image', value: url } : { type: 'url', value: url },
      })
    }

    // 查找 Hashtags
    const hashtagRegex = new RegExp(HASHTAG_REGEX.source, 'gi')
    while ((match = hashtagRegex.exec(content)) !== null) {
      // 检查是否与 URL 重叠
      const start = match.index
      const end = match.index + match[0].length
      const overlaps = matches.some(m => !(end <= m.start || start >= m.end))
      if (!overlaps) {
        matches.push({
          start,
          end,
          part: { type: 'hashtag', value: match[1] },
        })
      }
    }

    // 查找 Nostr mentions
    const mentionRegex = new RegExp(NOSTR_MENTION_REGEX.source, 'gi')
    while ((match = mentionRegex.exec(content)) !== null) {
      const start = match.index
      const end = match.index + match[0].length
      const overlaps = matches.some(m => !(end <= m.start || start >= m.end))
      if (!overlaps) {
        matches.push({
          start,
          end,
          part: { type: 'mention', value: match[2] || match[0] },
        })
      }
    }

    // 按位置排序
    matches.sort((a, b) => a.start - b.start)

    // 构建结果
    let lastEnd = 0
    for (const m of matches) {
      if (m.start > lastEnd) {
        result.push({ type: 'text', value: content.slice(lastEnd, m.start) })
      }
      result.push(m.part)
      lastEnd = m.end
    }
    if (lastEnd < content.length) {
      result.push({ type: 'text', value: content.slice(lastEnd) })
    }

    return result
  }, [content])

  // 收集图片用于预览
  const images = parts.filter((p): p is { type: 'image'; value: string } => p.type === 'image')

  return (
    <div>
      {/* 文本内容 */}
      <div className="whitespace-pre-wrap break-words text-sm md:text-base leading-relaxed">
        {parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return <span key={i}>{part.value}</span>
            case 'hashtag':
              return (
                <Link
                  key={i}
                  href={`/search?q=%23${part.value}`}
                  className="text-primary-400 hover:underline"
                >
                  #{part.value}
                </Link>
              )
            case 'mention':
              const shortMention = part.value.startsWith('npub')
                ? `@${part.value.slice(0, 12)}...`
                : part.value.slice(0, 16) + '...'
              return (
                <Link
                  key={i}
                  href={`/profile/${part.value}`}
                  className="text-primary-400 hover:underline"
                >
                  {shortMention}
                </Link>
              )
            case 'url':
              const displayUrl = part.value.length > 40
                ? part.value.slice(0, 40) + '...'
                : part.value
              return (
                <a
                  key={i}
                  href={part.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:underline"
                >
                  {displayUrl}
                </a>
              )
            case 'image':
              // 图片在文本中显示为链接，下方统一显示
              return (
                <a
                  key={i}
                  href={part.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:underline"
                >
                  [图片]
                </a>
              )
            default:
              return null
          }
        })}
      </div>

      {/* 图片预览 */}
      {images.length > 0 && (
        <div className={`mt-3 grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.slice(0, 4).map((img, i) => (
            <a
              key={i}
              href={img.value}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block rounded-lg overflow-hidden bg-dark-800"
            >
              <img
                src={img.value}
                alt=""
                className="w-full h-auto max-h-80 object-cover"
                loading="lazy"
                onError={(e) => {
                  // 图片加载失败时隐藏
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </a>
          ))}
          {images.length > 4 && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
              +{images.length - 4}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

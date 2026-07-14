import { afterEach, describe, expect, it } from 'vitest'
import { newsSecurityInternals } from './news.js'

const previousFeedHosts = process.env.NEWS_RSS_ALLOWED_HOSTS
const previousImageHosts = process.env.NEWS_IMAGE_ALLOWED_HOSTS
const previousFeedUrl = process.env.NEWS_RSS_URL

afterEach(() => {
  if (previousFeedHosts === undefined) delete process.env.NEWS_RSS_ALLOWED_HOSTS
  else process.env.NEWS_RSS_ALLOWED_HOSTS = previousFeedHosts
  if (previousImageHosts === undefined) delete process.env.NEWS_IMAGE_ALLOWED_HOSTS
  else process.env.NEWS_IMAGE_ALLOWED_HOSTS = previousImageHosts
  if (previousFeedUrl === undefined) delete process.env.NEWS_RSS_URL
  else process.env.NEWS_RSS_URL = previousFeedUrl
})

describe('RSS source-bound images', () => {
  it('always allowlists the configured feed host', () => {
    delete process.env.NEWS_RSS_ALLOWED_HOSTS
    const hosts = newsSecurityInternals.allowedFeedHosts('https://www.ansa.it/feed.xml')
    expect([...hosts]).toEqual(['www.ansa.it'])
  })

  it('gives the locked environment feed precedence over the DB default', async () => {
    process.env.NEWS_RSS_URL = 'https://feed.example/news.xml'
    await expect(newsSecurityInternals.configuredFeedUrl()).resolves.toBe('https://feed.example/news.xml')
  })

  it('creates only opaque proxy URLs for images bound to the feed source', () => {
    delete process.env.NEWS_IMAGE_ALLOWED_HOSTS
    const hosts = newsSecurityInternals.allowedImageHosts('https://www.ansa.it/feed.xml')
    expect(newsSecurityInternals.registerImage('https://www.ansa.it/image.jpg', hosts)).toMatch(/^\/api\/news\/image\/[A-Za-z0-9_-]{43}$/)
    expect(newsSecurityInternals.registerImage('https://attacker.example/image.jpg', hosts)).toBeNull()
  })
})

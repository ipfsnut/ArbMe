import { ImageResponse } from 'next/og';
import { getPost } from '@/lib/blog';
export const alt = 'ArbMe Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);

  const title = post?.metadata.title || 'ArbMe Blog';
  const description = post?.metadata.description || '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 80px',
          background: '#F8F6F1',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '24px',
              color: '#0E6B5E',
              fontWeight: 700,
            }}
          >
            ArbMe
          </div>
          <div
            style={{
              width: '80px',
              height: '4px',
              background: '#0E6B5E',
              borderRadius: '2px',
            }}
          />
          <div
            style={{
              fontSize: '52px',
              fontWeight: 700,
              color: '#1C1917',
              lineHeight: 1.2,
              maxWidth: '900px',
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: '24px',
                color: '#57534E',
                lineHeight: 1.5,
                maxWidth: '800px',
              }}
            >
              {description}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ fontSize: '18px', color: '#57534E' }}>
            arbme.epicdylan.com/blog
          </div>
          {post?.metadata.date && (
            <div style={{ fontSize: '18px', color: '#57534E' }}>
              {new Date(post.metadata.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}

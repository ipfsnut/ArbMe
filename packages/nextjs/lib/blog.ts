import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

export interface PostMetadata {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  image?: string;
  published: boolean;
  readingTime: string;
}

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export function getBlogPosts(): PostMetadata[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'));

  const posts = files
    .map((file) => {
      const slug = file.replace(/\.mdx$/, '');
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');
      const { data, content } = matter(raw);
      const stats = readingTime(content);

      return {
        slug,
        title: data.title || slug,
        date: data.date || '',
        description: data.description || '',
        tags: data.tags || [],
        image: data.image,
        published: data.published !== false,
        readingTime: stats.text,
      } satisfies PostMetadata;
    })
    .filter((p) => p.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

export function getPost(slug: string): { metadata: PostMetadata; content: string } | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const stats = readingTime(content);

  return {
    metadata: {
      slug,
      title: data.title || slug,
      date: data.date || '',
      description: data.description || '',
      tags: data.tags || [],
      image: data.image,
      published: data.published !== false,
      readingTime: stats.text,
    },
    content,
  };
}

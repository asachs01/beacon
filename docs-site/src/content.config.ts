import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema } from '@asachs01/astro-tinker/schemas';

export const collections = {
  posts: defineCollection({
    loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
    schema: postSchema,
  }),
};

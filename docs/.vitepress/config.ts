import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Hopwatch',
  description: 'Real-time public transport information: timetables, vehicle positions and rider reports.',
  // docs/design/ holds design documents that are not part of the published site.
  srcExclude: ['design/**'],
  // Canonical URL of each page as published on docs.velis.si, under the `--base` given to the build.
  transformHead({ pageData, siteConfig }) {
    const base = siteConfig.site.base;
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html');
    return [
      [
        'link',
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: `${base}hopwatch-icon.svg`,
        },
      ],
      ['link', { rel: 'canonical', href: `https://docs.velis.si${base}${path}` }],
    ];
  },
  themeConfig: {
    logo: '/hopwatch-icon.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Local development', link: '/guide/local-development' },
      { text: 'Contributing', link: '/contributing' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/velis74/hopwatch' }],
  },
});

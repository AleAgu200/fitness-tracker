module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Inline .sql files as string literals so Metro can bundle Drizzle migrations
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};

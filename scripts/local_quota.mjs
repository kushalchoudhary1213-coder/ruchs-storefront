export function createLocalQuotaDb() {
  const counters = new Map();
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.trimStart().startsWith('SELECT')) {
                const count = counters.get(args.join(':'));
                return count == null ? null : {count};
              }
              const [day, scope, subject, limit] = args;
              const key = [day, scope, subject].join(':');
              const count = counters.get(key) || 0;
              if (count >= limit) return null;
              counters.set(key, count + 1);
              return {count: count + 1};
            },
            async run() {
              const [day, scope, subject] = args;
              if (sql.trimStart().startsWith('UPDATE')) {
                const key = [day, scope, subject].join(':');
                counters.set(key, Math.max(0, (counters.get(key) || 0) - 1));
              } else if (sql.includes("'provider', 'genlook'")) {
                counters.set([day, 'provider', 'genlook'].join(':'), args[1]);
              }
              return {success: true};
            },
          };
        },
      };
    },
  };
}

export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    'greet' : IDL.Func([IDL.Text], [IDL.Text], []),
    'whoami' : IDL.Func([], [IDL.Principal], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };

export const idlFactory = ({ IDL }) => {
  const Time = IDL.Int;
  const Conversation = IDL.Record({
    id: IDL.Nat,
    participants: IDL.Vec(IDL.Principal),
    lastMessageAt: Time,
    messageCount: IDL.Nat,
  });
  const Message = IDL.Record({
    id: IDL.Nat,
    content: IDL.Text,
    from: IDL.Principal,
    conversationId: IDL.Nat,
    timestamp: Time,
  });
  const GuestChatOk = IDL.Record({
    token: IDL.Text,
    conversationId: IDL.Nat,
  });
  const GuestChatResult = IDL.Variant({
    ok: GuestChatOk,
    err: IDL.Text,
  });
  const SendResult = IDL.Variant({
    ok: IDL.Nat,
    err: IDL.Text,
  });
  const GuestThreadInfo = IDL.Record({
    id: IDL.Nat,
    tokenPreview: IDL.Text,
    lastActive: IDL.Int,
    messageCount: IDL.Nat,
    expiresAt: IDL.Opt(IDL.Int),
  });
  return IDL.Service({
    getConversation: IDL.Func([IDL.Nat], [IDL.Opt(Conversation)], ["query"]),
    getMessages: IDL.Func([IDL.Nat], [IDL.Vec(Message)], ["query"]),
    getMyConversations: IDL.Func([], [IDL.Vec(Conversation)], ["query"]),
    getMyDailyMessageCount: IDL.Func([], [IDL.Nat], ["query"]),
    getOrCreateConversation: IDL.Func([IDL.Principal], [IDL.Opt(IDL.Nat)], []),
    pruneOldMessages: IDL.Func([IDL.Nat], [IDL.Nat], []),
    sendMessage: IDL.Func([IDL.Nat, IDL.Text], [SendResult], []),
    sendGuestMessageToMaster: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    startOrContinueGuestChat: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [GuestChatResult], []),
    sendGuestReplyByToken: IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
    getGuestMessagesByToken: IDL.Func([IDL.Text], [IDL.Vec(Message)], ["query"]),
    getGuestInboxExpiryByToken: IDL.Func([IDL.Text], [IDL.Opt(IDL.Int)], ["query"]),
    listOpenGuestThreads: IDL.Func([], [IDL.Vec(GuestThreadInfo)], ["query"]),
    isGuestInbox: IDL.Func([IDL.Nat], [IDL.Bool], ["query"]),
    getDefaultMasterPrincipal: IDL.Func([], [IDL.Principal], ["query"]),
    amITrustedMaster: IDL.Func([], [IDL.Bool], ["query"]),
    getGuestInboxExpiry: IDL.Func([IDL.Nat], [IDL.Opt(IDL.Int)], ["query"]),
    getGuestThreadToken: IDL.Func([IDL.Nat], [IDL.Opt(IDL.Text)], ["query"]),
    pruneExpiredGuestMessages: IDL.Func([], [IDL.Nat], []),
    deleteGuestChat: IDL.Func([IDL.Nat], [IDL.Text], []),
    wipeAllGuestChats: IDL.Func([], [IDL.Text], []),
  });
};
export const init = ({ IDL }) => {
  return [];
};

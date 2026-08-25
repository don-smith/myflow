export const notesPlugin = {
  id: "notes",
  capability: "file-write",
  createNote(title: string) {
    return { title, body: "" };
  },
};

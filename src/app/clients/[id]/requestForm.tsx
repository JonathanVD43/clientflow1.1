import { createDocumentRequestAction } from "./requestActions";

export function CreateRequestForm({ clientId }: { clientId: string }) {
  return (
    <form action={createDocumentRequestAction} className="flex gap-2">
      <input type="hidden" name="client_id" value={clientId} />
      <input name="title" placeholder="e.g. Bank statement" className="flex-1 border rounded-lg p-2" required />
      <button className="border rounded-lg px-3">Add</button>
    </form>
  );
}

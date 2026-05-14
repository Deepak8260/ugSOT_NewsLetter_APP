import { useState } from "react";
import { Link } from "wouter";
import { useListNewsletters, useDeleteNewsletter, useSendNewsletter, getListNewslettersQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Send, Download, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUploadNewsletter } from "@/hooks/use-upload";

export default function Newsletters() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useListNewsletters(
    { page, pageSize: 10 },
    { query: { queryKey: getListNewslettersQueryKey({ page, pageSize: 10 }) } }
  );

  const deleteMutation = useDeleteNewsletter();
  const sendMutation = useSendNewsletter();
  const { uploadNewsletter, isUploading } = useUploadNewsletter();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [newsletterToDelete, setNewsletterToDelete] = useState<number | null>(null);
  
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [newsletterToSend, setNewsletterToSend] = useState<number | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadData, setUploadData] = useState({ title: "", topic: "", description: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const confirmDelete = (id: number) => {
    setNewsletterToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = () => {
    if (!newsletterToDelete) return;
    
    deleteMutation.mutate({ id: newsletterToDelete }, {
      onSuccess: () => {
        toast({ title: "Newsletter deleted successfully" });
        setDeleteConfirmOpen(false);
        setNewsletterToDelete(null);
        queryClient.invalidateQueries({ queryKey: getListNewslettersQueryKey() });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Failed to delete newsletter",
        });
      }
    });
  };

  const confirmSend = (id: number) => {
    setNewsletterToSend(id);
    setSendConfirmOpen(true);
  };

  const handleSend = () => {
    if (!newsletterToSend) return;
    
    sendMutation.mutate({ id: newsletterToSend }, {
      onSuccess: (result) => {
        toast({ 
          title: "Newsletter sending started",
          description: `Queued: ${result.total} (Sent: ${result.sent}, Failed: ${result.failed})`,
        });
        setSendConfirmOpen(false);
        setNewsletterToSend(null);
        queryClient.invalidateQueries({ queryKey: getListNewslettersQueryKey() });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Failed to send newsletter",
        });
        setSendConfirmOpen(false);
      }
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadData.title || !uploadData.topic || !uploadFile) {
      toast({
        variant: "destructive",
        title: "Missing required fields",
      });
      return;
    }

    try {
      await uploadNewsletter({
        title: uploadData.title,
        topic: uploadData.topic,
        description: uploadData.description,
        pdf: uploadFile,
      });
      
      toast({ title: "Newsletter uploaded successfully" });
      setUploadOpen(false);
      setUploadData({ title: "", topic: "", description: "" });
      setUploadFile(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
      });
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Newsletters</h1>
          <p className="text-muted-foreground mt-1">Manage and distribute corporate newsletters.</p>
        </div>
        
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Newsletter
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Newsletter</DialogTitle>
              <DialogDescription>
                Upload a new PDF newsletter to distribute to employees.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUploadSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input 
                  id="title" 
                  value={uploadData.title} 
                  onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic">Topic *</Label>
                <Input 
                  id="topic" 
                  value={uploadData.topic} 
                  onChange={(e) => setUploadData({ ...uploadData, topic: e.target.value })} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  value={uploadData.description} 
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf">PDF File *</Label>
                <Input 
                  id="pdf" 
                  type="file" 
                  accept=".pdf" 
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)} 
                  required 
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Upload
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Title</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6"><Skeleton className="h-4 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                    <TableCell className="text-right pr-6"><Skeleton className="h-8 w-24 inline-block" /></TableCell>
                  </TableRow>
                ))
              ) : !data?.newsletters?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No newsletters found.
                  </TableCell>
                </TableRow>
              ) : (
                data.newsletters.map((newsletter) => (
                  <TableRow key={newsletter.id}>
                    <TableCell className="pl-6 font-medium">
                      <Link href={`/newsletters/${newsletter.id}`} className="hover:underline text-primary">
                        {newsletter.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="bg-secondary px-2 py-1 rounded-md text-xs font-medium">
                        {newsletter.topic}
                      </span>
                    </TableCell>
                    <TableCell>{format(new Date(newsletter.uploadedAt), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {newsletter.totalSent ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">{newsletter.totalSent} Sent</span>
                        ) : (
                          <span className="text-muted-foreground">Not sent yet</span>
                        )}
                        {newsletter.totalFailed ? (
                          <span className="text-destructive ml-2 font-medium">({newsletter.totalFailed} Failed)</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmSend(newsletter.id)}
                          disabled={sendMutation.isPending && newsletterToSend === newsletter.id}
                        >
                          {sendMutation.isPending && newsletterToSend === newsletter.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a href={`/api/newsletters/${newsletter.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => confirmDelete(newsletter.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {data && data.total > 0 && (
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * data.pageSize) + 1} to {Math.min(page * data.pageSize, data.total)} of {data.total} newsletters
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * data.pageSize >= data.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Newsletter</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this newsletter? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Newsletter</DialogTitle>
            <DialogDescription>
              Are you sure you want to send this newsletter to all employees? This may take some time depending on the number of employees.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Confirm Send"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
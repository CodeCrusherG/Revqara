import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { teamApi } from '../services/api';
import { useAuth } from '@/context/AuthContext';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function AcceptInvitePage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { switchWorkspace } = useAuth();
    const token = params.get('token');
    const [state, setState] = useState('working');   // working | done | error
    const [message, setMessage] = useState('');
    const [workspace, setWorkspace] = useState(null);

    useEffect(() => {
        if (!token) { setState('error'); setMessage('No invite token provided.'); return; }
        teamApi.acceptInvite(token)
            .then((res) => { setState('done'); setWorkspace(res.workspace); })
            .catch((e) => { setState('error'); setMessage(e?.response?.data?.detail || 'This invite is invalid or has expired.'); });
    }, [token]);

    return (
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
            <Card className="w-full">
                <CardContent className="flex flex-col items-center gap-4 p-10">
                    {state === 'working' && (<><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Accepting your invite…</p></>)}
                    {state === 'done' && (
                        <>
                            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">You're in!</h1>
                                <p className="mt-1 text-sm text-muted-foreground">You joined <span className="font-medium">{workspace?.name}</span> as <span className="capitalize">{workspace?.role}</span>.</p>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => switchWorkspace(workspace.id)}>Open {workspace?.name}</Button>
                                <Button variant="outline" onClick={() => navigate('/')}>Go to current workspace</Button>
                            </div>
                        </>
                    )}
                    {state === 'error' && (
                        <>
                            <AlertCircle className="h-12 w-12 text-destructive" />
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">Couldn't accept invite</h1>
                                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                            </div>
                            <Button variant="outline" onClick={() => navigate('/')}>Back to app</Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

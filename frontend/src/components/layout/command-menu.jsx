import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Send, LayoutDashboard, MessageSquare, Target, Users, ListChecks,
    FileText, CreditCard, Settings,
} from 'lucide-react';
import {
    CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';

const COMMANDS = [
    { group: 'Campaigns', items: [
        { title: 'New campaign', url: '/', icon: Send },
        { title: 'Analytics dashboard', url: '/dashboard', icon: LayoutDashboard },
    ]},
    { group: 'Conversations', items: [
        { title: 'Inbox', url: '/inbox', icon: MessageSquare },
        { title: 'Leads', url: '/leads', icon: Target },
    ]},
    { group: 'Audience', items: [
        { title: 'Contacts', url: '/contacts', icon: Users },
        { title: 'Contact lists', url: '/lists', icon: ListChecks },
        { title: 'Templates', url: '/templates', icon: FileText },
    ]},
    { group: 'Account', items: [
        { title: 'Plan & billing', url: '/billing', icon: CreditCard },
        { title: 'Settings', url: '/settings', icon: Settings },
    ]},
];

export function CommandMenu({ open, setOpen }) {
    const navigate = useNavigate();

    React.useEffect(() => {
        const down = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [setOpen]);

    const go = (url) => { setOpen(false); navigate(url); };

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Search or jump to…" />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                {COMMANDS.map((g, i) => (
                    <React.Fragment key={g.group}>
                        {i > 0 && <CommandSeparator />}
                        <CommandGroup heading={g.group}>
                            {g.items.map((item) => (
                                <CommandItem key={item.url} value={`${g.group} ${item.title}`} onSelect={() => go(item.url)}>
                                    <item.icon className="size-4" />
                                    <span>{item.title}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </React.Fragment>
                ))}
            </CommandList>
        </CommandDialog>
    );
}

import React from 'react';
import { Search, Sun, Moon, Bell } from 'lucide-react';
import { useTheme } from 'next-themes';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { CommandMenu } from '@/components/layout/command-menu';

function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    return (
        <Button variant="ghost" size="icon" className="size-9" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Sun className="size-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </Button>
    );
}

export default function MainLayout({ children }) {
    const [cmdOpen, setCmdOpen] = React.useState(false);

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                {/* Sticky top bar */}
                <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
                    <SidebarTrigger className="-ms-1" />
                    <Separator orientation="vertical" className="me-2 h-5" />

                    <button
                        onClick={() => setCmdOpen(true)}
                        className="group inline-flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
                    >
                        <Search className="size-4" />
                        <span className="flex-1 text-left">Search…</span>
                        <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
                            ⌘K
                        </kbd>
                    </button>

                    <div className="ms-auto flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-9 text-muted-foreground">
                            <Bell className="size-[1.1rem]" />
                        </Button>
                        <ThemeToggle />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {children}
                </main>

                <CommandMenu open={cmdOpen} setOpen={setCmdOpen} />
            </SidebarInset>
        </SidebarProvider>
    );
}

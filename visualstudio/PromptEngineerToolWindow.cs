using System;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace UniversalAIPromptEngineer.VisualStudio
{
    [Guid("C1F00417-2484-4C8F-85C9-6F9FC7E284A0")]
    public sealed class PromptEngineerToolWindow : ToolWindowPane
    {
        public PromptEngineerToolWindow() : base(null)
        {
            Caption = "Universal AI Prompt Engineer";
            Content = new PromptEngineerControl();
        }
    }
}

using System;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace UniversalAIPromptEngineer.VisualStudio
{
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [InstalledProductRegistration("Universal AI Prompt Engineer", "AI prompt engineering for Visual Studio", "0.1.0")]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [ProvideToolWindow(typeof(PromptEngineerToolWindow))]
    [Guid(PackageGuid)]
    public sealed class PromptEngineerPackage : AsyncPackage
    {
        public const string PackageGuid = "E259C1A3-38E3-46D5-93F8-4108394BB14B";
        private static readonly Guid CommandSetGuid = new Guid("A3416E78-BCA8-43A4-B640-2EC76AF05B32");
        private const int OpenPromptEngineerCommandId = 0x0100;

        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await base.InitializeAsync(cancellationToken, progress);
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);

            var commandService = await GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService;
            if (commandService == null)
            {
                throw new InvalidOperationException("Visual Studio could not initialize the Prompt Engineer command.");
            }

            var commandId = new CommandID(CommandSetGuid, OpenPromptEngineerCommandId);
            commandService.AddCommand(new MenuCommand(ShowPromptEngineer, commandId));
        }

        private void ShowPromptEngineer(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var window = FindToolWindow(typeof(PromptEngineerToolWindow), 0, true);
            if (window == null || window.Frame == null)
            {
                throw new InvalidOperationException("Visual Studio could not open the Prompt Engineer window.");
            }

            ErrorHandler.ThrowOnFailure(((IVsWindowFrame)window.Frame).Show());
        }
    }
}

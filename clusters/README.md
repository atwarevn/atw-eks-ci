```shell
flux get kustomizations --watch
flux get helmreleases --all-namespaces
flux logs --all-namespaces --level=error
flux delete helmrelease karpenter --namespace karpenter
```
```shell
flux create source helm karpenter \
  --url oci://public.ecr.aws/karpenter \
  --namespace karpenter \
  --export > ./clusters/karpenter/karpenter-source.yaml
```

```shell
flux create helmrelease karpenter --chart karpenter \
  --source HelmRepository/karpenter \
  --chart-version v0.27.3 \
  --namespace karpenter \
  --create-target-namespace \
  --export > ./clusters/karpenter/karpenter-release.yaml

```